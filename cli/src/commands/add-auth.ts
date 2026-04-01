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
	provider?: string;
	yes?: boolean;
	dryRun?: boolean;
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

async function wireApps(
	root: string,
	apps: string[],
	pm: string,
	scope: string,
): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const protocol = pm === "npm" ? "*" : "workspace:*";
	for (const appName of apps) {
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
	const apps = await listApps(root);

	// ── Prompts ──────────────────────────────────────────────────────────────────
	const defaults = {
		provider: (options.provider ?? "clerk") as AuthProvider,
		selectedApps: apps,
	};

	const answers: {
		provider: AuthProvider;
		selectedApps: string[];
	} = options.yes
		? defaults
		: await inquirer.prompt(
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
					when: !options.provider,
				},
				...(apps.length > 0
					? [
							{
								type: "checkbox",
								name: "selectedApps",
								message: q(
									`Wire ${scopedPackageName(scope, "auth")} into which apps?`,
									"adds dep to package.json — run install after",
								),
								choices: apps,
								default: apps,
							},
						]
					: []),
			);

	const provider = (answers.provider ?? defaults.provider) as AuthProvider;
	const selectedApps = (answers.selectedApps ??
		defaults.selectedApps) as string[];
	const scaffolder = getScaffolder(provider);

	// ── Dry run ────────────────────────────────────────────────────────────────
	if (options.dryRun) {
		printSection(`[dry run] Creating packages/auth — ${scaffolder.label}`);
		const step = createStepRunner(4, true);
		await step("Write package.json and tsconfig.json", async () => {});
		await step(`Scaffold ${scaffolder.label} ./files`, async () => {});
		await step("Install provider npm packages", async () => {});
		await step(
			selectedApps.length > 0
				? `Wire into: ${selectedApps.join(", ")}`
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
		selectedApps.length > 0
			? `Add ${scopedPackageName(scope, "auth")} to: ${selectedApps.join(", ")}`
			: "Skip app wiring (no apps found)",
		async () => {
			if (selectedApps.length > 0)
				await wireApps(root, selectedApps, pm, scope);
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
			{
				label: "Next apps →",
				cmd: `import { ... } from "${scopedPackageName(scope, "auth")}/next"`,
			},
			...(provider === "better-auth"
				? [
						{
							label: "Vite/Expo apps →",
							cmd: `use ${scopedPackageName(scope, "auth")}/client and set VITE_APP_URL/NEXT_PUBLIC_APP_URL to your auth host`,
						},
					]
				: [
						{
							label: "Non-Next apps →",
							cmd: `use ${scopedPackageName(scope, "auth")}/client (+ provider app setup), ${scopedPackageName(scope, "auth")}/next is Next-only`,
						},
					]),
			{
				label: "Server import →",
				cmd: `import { ... } from "${scopedPackageName(scope, "auth")}/server"`,
			},
		],
	});
}
