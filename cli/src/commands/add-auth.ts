import inquirer from "inquirer";
import path from "path";
import { pathExists } from "../files.js";
import { detectPackageManager, pmAdd, run } from "../exec.js";
import { loadConfig, resolveScope, scopedPackageName } from "../config.js";
import {
	requireMonorepoRoot,
	MonorepoRootNotFoundError,
} from "../resolve-root.js";
import {
	q,
	createStepRunner,
	printSection,
	printSuccess,
	printError,
} from "../ui.js";
import {
	clerkScaffolder,
	betterAuthScaffolder,
	workosScaffolder,
	writeAuthPackageBase,
	type AuthProvider,
	type AuthPackageScaffolder,
} from "../setups/auth/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddAuthOptions {
	app?: string;
	provider?: string;
	framework?: string;
	yes?: boolean;
	dryRun?: boolean;
}

type AppFramework = "nextjs" | "vite" | "remix" | "expo";

interface AppTarget {
	name: string;
	framework: AppFramework;
}

// ─── Provider menu ────────────────────────────────────────────────────────────

const PROVIDERS: Array<{ value: AuthProvider; name: string }> = [
	{
		value: "clerk",
		name: "Clerk        — hosted UI, zero-config, generous free tier",
	},
	{
		value: "better-auth",
		name: "Better Auth  — open-source, self-hosted, SQLite / Postgres",
	},
	{
		value: "workos",
		name: "WorkOS       — enterprise SSO, SCIM, MFA, hosted AuthKit UI",
	},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScaffolder(provider: AuthProvider): AuthPackageScaffolder {
	switch (provider) {
		case "clerk":
			return clerkScaffolder;
		case "better-auth":
			return betterAuthScaffolder;
		case "workos":
			return workosScaffolder;
	}
}

function providerDocs(provider: AuthProvider): string {
	switch (provider) {
		case "clerk":
			return "https://clerk.com/docs";
		case "better-auth":
			return "https://www.better-auth.com/docs";
		case "workos":
			return "https://workos.com/docs/user-management";
	}
	return "";
}

async function listApps(root: string): Promise<string[]> {
	const appsDir = path.join(root, "apps");
	if (!(await pathExists(appsDir))) return [];
	const { default: fs } = await import("fs-extra");
	const entries = await fs.readdir(appsDir, { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function normalizeFramework(framework?: string): AppFramework | null {
	switch (framework) {
		case "nextjs":
		case "vite":
		case "remix":
		case "expo":
			return framework;
		default:
			return null;
	}
}

async function detectAppFramework(
	appDir: string,
	fallback: AppFramework | null,
): Promise<AppFramework> {
	const { default: fs } = await import("fs-extra");
	const pkgPath = path.join(appDir, "package.json");
	if (await pathExists(pkgPath)) {
		try {
			const pkg = await fs.readJson(pkgPath);
			const dependencies = {
				...pkg.dependencies,
				...pkg.devDependencies,
				...pkg.peerDependencies,
			};
			if (
				dependencies.next ||
				dependencies["next"] ||
				dependencies["next-auth"]
			) {
				return "nextjs";
			}
			if (
				dependencies.expo ||
				dependencies["expo-router"] ||
				dependencies["react-native"]
			) {
				return "expo";
			}
			if (
				dependencies["@remix-run/react"] ||
				dependencies["@remix-run/node"] ||
				dependencies["@remix-run/dev"]
			) {
				return "remix";
			}
			if (
				dependencies.vite ||
				dependencies["@vitejs/plugin-react"] ||
				dependencies["vite"]
			) {
				return "vite";
			}
		} catch {
			// ignore and fall back below
		}
	}

	for (const candidate of [
		"next.config.ts",
		"next.config.js",
		"next.config.mjs",
	]) {
		if (await pathExists(path.join(appDir, candidate))) return "nextjs";
	}
	for (const candidate of ["app/root.tsx", "app/root.jsx", "app/routes.tsx"]) {
		if (await pathExists(path.join(appDir, candidate))) return "remix";
	}
	for (const candidate of ["vite.config.ts", "vite.config.js"]) {
		if (await pathExists(path.join(appDir, candidate))) return "vite";
	}
	for (const candidate of ["app.json", "app.config.ts", "app.config.js"]) {
		if (await pathExists(path.join(appDir, candidate))) return "expo";
	}

	return fallback ?? "nextjs";
}

async function listAppTargets(
	root: string,
	fallbackFramework: AppFramework | null,
): Promise<AppTarget[]> {
	const appNames = await listApps(root);
	const targets: AppTarget[] = [];
	for (const name of appNames) {
		const appDir = path.join(root, "apps", name);
		const framework = await detectAppFramework(appDir, fallbackFramework);
		targets.push({ name, framework });
	}
	return targets;
}

function formatAppChoice(app: AppTarget): string {
	return `${app.name}  — ${app.framework}`;
}

function getSetupTips(
	authPackageName: string,
	provider: AuthProvider,
	appTargets: AppTarget[],
): Array<{ label: string; cmd: string }> {
	const nextApps = appTargets.filter((app) => app.framework === "nextjs");
	const nonNextApps = appTargets.filter((app) => app.framework !== "nextjs");
	const tips: Array<{ label: string; cmd: string }> = [];

	if (nextApps.length > 0) {
		tips.push({
			label: "Next apps →",
			cmd: `${nextApps.map((app) => app.name).join(", ")}: import { ... } from "${authPackageName}/next" and add app middleware`,
		});
	}

	if (nonNextApps.length > 0) {
		tips.push({
			label: `${nonNextApps
				.map((app) => `${app.framework} app ${app.name}`)
				.join(", ")} →`,
			cmd: `use ${authPackageName}/client in the app shell and set the public auth URL env vars`,
		});
	}

	if (provider === "better-auth") {
		tips.push({
			label: "Better Auth →",
			cmd: `add a Next.js route handler only for Next apps, then run the Better Auth migration`,
		});
	}

	return tips;
}

async function wireApps(
	root: string,
	apps: AppTarget[],
	pm: string,
	scope: string,
): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const protocol = pm === "npm" ? "*" : "workspace:*";
	for (const app of apps) {
		const appName = app.name;
		const pkgPath = path.join(root, "apps", appName, "package.json");
		if (!(await pathExists(pkgPath))) continue;
		const pkg = await fs.readJson(pkgPath);
		pkg.dependencies = {
			...pkg.dependencies,
			[scopedPackageName(scope, "auth")]: protocol,
		};
		await fs.writeJson(pkgPath, pkg, { spaces: 2 });
	}
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function addAuthCommand(options: AddAuthOptions): Promise<void> {
	// ── Resolve root from wherever the user is running from ─────────────────────
	let root: string;
	try {
		root = await requireMonorepoRoot();
	} catch (err) {
		if (err instanceof MonorepoRootNotFoundError) {
			printError({
				title: "Could not find monorepo root",
				detail: err.message,
				recovery: [
					{ label: "Initialise a new workspace:", cmd: "nx-factory-cli init" },
					{ label: "Or navigate to your workspace root first.", cmd: "" },
				],
			});
		} else {
			printError({
				title: "Unexpected error resolving workspace root",
				detail: String(err),
				recovery: [
					{
						label: "Try running from your monorepo root:",
						cmd: "cd <monorepo-root>",
					},
				],
			});
		}
		process.exit(1);
	}

	// ── Guard: packages/auth must not already exist ──────────────────────────────
	const authPkgDir = path.join(root, "packages", "auth");
	if (await pathExists(authPkgDir)) {
		printError({
			title: "packages/auth already exists",
			detail: "Remove or rename it before running add-auth again.",
			recovery: [
				{ label: "Remove:", cmd: "rm -rf packages/auth" },
				{ label: "Then:", cmd: "nx-factory-cli add-auth" },
			],
		});
		process.exit(1);
	}

	const cfg = await loadConfig();
	const scope = resolveScope(cfg);
	const detectedPm = await detectPackageManager(root);
	const pm = detectedPm ?? cfg?.pkgManager ?? "pnpm";
	const frameworkHint = normalizeFramework(options.framework);
	const apps = await listAppTargets(root, frameworkHint);
	const authPackageName = scopedPackageName(scope, "auth");
	const selectedAppNames = options.app
		? [options.app]
		: apps.map((app) => app.name);
	const selectedAppTargets = selectedAppNames
		.map((appName) => apps.find((app) => app.name === appName))
		.filter((app): app is AppTarget => Boolean(app));
	if (options.app && selectedAppTargets.length === 0) {
		printError({
			title: `apps/${options.app} not found`,
			detail: "Pick an app from the apps/ directory or create it first.",
			recovery: [
				{ label: "List apps:", cmd: "ls apps" },
				{ label: "Create one first:", cmd: "nx-factory-cli add-app" },
			],
		});
		process.exit(1);
	}

	// ── Prompts ──────────────────────────────────────────────────────────────────
	const defaults = {
		provider: (options.provider ?? "clerk") as AuthProvider,
		selectedApps: selectedAppNames,
	};

	const answers = options.yes
		? defaults
		: await inquirer.prompt<{
				provider?: AuthProvider;
				selectedApps?: string[];
			}>([
				...(!options.provider
					? [
							{
								type: "list",
								name: "provider",
								message: q(
									"Auth provider",
									"all production-ready — pick based on your needs",
								),
								choices: PROVIDERS.map((p) => ({
									name: p.name,
									value: p.value,
									short: p.value,
								})),
								default: defaults.provider,
							},
						]
					: []),
				...(!options.app && apps.length > 0
					? [
							{
								type: "checkbox",
								name: "selectedApps",
								message: q(
									`Wire ${authPackageName} into which apps?`,
									"adds dep to package.json — run install after",
								),
								choices: apps.map((app) => ({
									name: formatAppChoice(app),
									value: app.name,
								})),
								default: apps.map((app) => app.name),
							},
						]
					: []),
			]);

	const provider = (answers.provider ?? defaults.provider) as AuthProvider;
	const selectedApps = (answers.selectedApps ??
		defaults.selectedApps) as string[];
	const selectedTargets = selectedApps
		.map((appName) => apps.find((app) => app.name === appName))
		.filter((app): app is AppTarget => Boolean(app));
	const scaffolder = getScaffolder(provider);

	// ── Dry run ────────────────────────────────────────────────────────────────
	if (options.dryRun) {
		printSection(`[dry run] Creating packages/auth — ${scaffolder.label}`);
		const step = createStepRunner(4, true);
		await step("Write package.json and tsconfig.json", async () => {});
		await step(`Scaffold ${scaffolder.label} ./files`, async () => {});
		await step("Install provider npm packages", async () => {});
		await step(
			selectedTargets.length > 0
				? `Wire into: ${selectedTargets
						.map((app) => `${app.name} (${app.framework})`)
						.join(", ")}`
				: "No apps to wire",
			async () => {},
		);
		printSuccess({
			title: "packages/auth ready (dry run — nothing written)",
			commands: [
				{
					cmd: `nx-factory-cli add-auth --provider ${provider}`,
					comment: "run without --dry-run to apply",
				},
			],
		});
		return;
	}

	// ── Real scaffold ──────────────────────────────────────────────────────────
	printSection(`Creating packages/auth — ${scaffolder.label}`);
	const step = createStepRunner(4);

	await step("Write package base files", async () => {
		await writeAuthPackageBase(authPkgDir, scaffolder, scope);
	});

	await step(`Scaffold ${scaffolder.label} source files`, async () => {
		await scaffolder.scaffold(authPkgDir, {
			provider,
			workspaceRoot: root,
			workspaceName: cfg?.workspaceName ?? "workspace",
			scope,
			pm,
		});
	});

	await step(`Install ${scaffolder.label} packages`, async () => {
		const deps = Object.keys(scaffolder.dependencies);
		const devDeps = Object.keys(scaffolder.devDependencies);
		if (deps.length > 0) {
			await run(pm, [pmAdd(pm), ...deps], { cwd: authPkgDir });
		}
		if (devDeps.length > 0) {
			await run(pm, [pmAdd(pm), "-D", ...devDeps], { cwd: authPkgDir });
		}
	});

	await step(
		selectedTargets.length > 0
			? `Add ${authPackageName} to: ${selectedTargets
					.map((app) => `${app.name} (${app.framework})`)
					.join(", ")}`
			: "Skip app wiring (no apps found)",
		async () => {
			if (selectedTargets.length > 0)
				await wireApps(root, selectedTargets, pm, scope);
		},
	);

	// ── Success ────────────────────────────────────────────────────────────────
	const nextSteps: Array<{ cmd: string; comment?: string }> = [
		{ cmd: `${pm} install`, comment: "install new deps across the workspace" },
		{
			cmd: "cat packages/auth/.env.example",
			comment: "copy vars to your app's .env.local",
		},
		{
			cmd: `${pm} nx build ${scopedPackageName(scope, "auth")}`,
			comment: "build the auth package",
		},
	];
	if (provider === "better-auth") {
		nextSteps.push({
			cmd: "npx better-auth migrate",
			comment: "create DB tables",
		});
	}

	printSuccess({
		title: `packages/auth created (${scaffolder.label})`,
		commands: nextSteps,
		tips: [
			{ label: "Docs →", cmd: providerDocs(provider) },
			...getSetupTips(authPackageName, provider, selectedTargets),
			{
				label: "Server import →",
				cmd: `import { ... } from "${authPackageName}/server"`,
			},
		],
	});
}
