import inquirer from "inquirer";
import path from "path";
import { pathExists, writeJson, writeFile, ensureDir } from "../files.js";
import { type PackageVisibility } from "../config.js";
import { packageTsConfig } from "../tsconfigs.js";
import { loadConfig, resolveScope, scopedPackageName } from "../config.js";
import { detectPackageManager, pmWorkspaceProtocol } from "../exec.js";
import {
	requireMonorepoRoot,
	MonorepoRootNotFoundError,
} from "../resolve-root.js";
import {
	c,
	q,
	createStepRunner,
	printSection,
	printSuccess,
	printError,
} from "../ui.js";

const LIB_TYPES = ["utils", "hooks", "config", "types", "api"] as const;
type LibType = (typeof LIB_TYPES)[number];

interface AddLibOptions {
	name?: string;
	type?: string;
	yes?: boolean;
	dryRun?: boolean;
}

export async function addLibCommand(options: AddLibOptions): Promise<void> {
	// ── Resolve monorepo root from wherever the user invokes this ──────────────
	// Bug fix: was using process.cwd() directly, which breaks when run from a
	// subdirectory (e.g. apps/my-app). Use requireMonorepoRoot() like every
	// other command so the lib always lands in <workspace-root>/packages/.
	let workspaceRoot: string;
	try {
		workspaceRoot = await requireMonorepoRoot();
	} catch (err) {
		if (err instanceof MonorepoRootNotFoundError) {
			printError({
				title: "Could not find monorepo root",
				detail: String(err),
				recovery: [
					{ label: "Run from inside your nx-factory-cli workspace:", cmd: "cd <monorepo-root>" },
				],
			});
		} else {
			printError({
				title: "Unexpected error resolving workspace root",
				detail: String(err),
				recovery: [
					{ label: "Try running from your monorepo root:", cmd: "cd <monorepo-root>" },
				],
			});
		}
		process.exit(1);
		return;
	}

	const cfg = await loadConfig();
	const scope = resolveScope(cfg);
	const detectedPm = await detectPackageManager(workspaceRoot);

	const defaults = {
		libName: options.name ?? "shared",
		libType: (options.type ?? "utils") as LibType,
		visibility: "internal" as PackageVisibility,
		pm: detectedPm ?? cfg?.pkgManager ?? "pnpm",
	};

	const answers = options.yes
		? defaults
		: await inquirer.prompt([
				{
					type: "input",
					name: "libName",
					message: q("Library name", "lives at packages/<n>"),
					default: defaults.libName,
					validate: (v: string) =>
						/^[a-z0-9-]+$/.test(v) ||
						c.red("Only lowercase letters, numbers, and dashes"),
				},
				{
					type: "select",
					name: "libType",
					message: q("Library type", "determines the initial file structure"),
					choices: [
						{ name: "utils   — shared helper functions", value: "utils" },
						{ name: "hooks   — shared React hooks", value: "hooks" },
						{ name: "config  — shared config / constants", value: "config" },
						{ name: "types   — shared TypeScript types", value: "types" },
						{ name: "api     — shared API client / fetchers", value: "api" },
					],
					default: defaults.libType,
				},
				{
					type: "select",
					name: "visibility",
					message: q(
						"Package visibility",
						"internal = private to this monorepo · public = will be published to npm",
					),
					choices: [
						{ name: "internal  — private: true, workspace only", value: "internal" },
						{ name: "public    — will be published to npm", value: "public" },
					],
					default: defaults.visibility,
				},
				{
					type: "select",
					name: "pm",
					message: q("Package manager"),
					choices: ["pnpm", "npm", "yarn", "bun"],
					default: defaults.pm,
					when: !detectedPm,
				},
			]);

	const libName = (answers.libName ?? defaults.libName) as string;
	const libType = (answers.libType ?? defaults.libType) as LibType;
	const visibility = (answers.visibility ?? defaults.visibility) as PackageVisibility;
	const pm = (answers.pm ?? detectedPm ?? cfg?.pkgManager ?? "pnpm") as string;

	// Always rooted at workspaceRoot, never process.cwd()
	const libDir = path.join(workspaceRoot, "packages", libName);

	if (await pathExists(libDir)) {
		printError({
			title: `packages/${libName} already exists`,
			recovery: [
				{
					label: "Choose a different name:",
					cmd: `nx-factory-cli add-lib --name ${libName}-2`,
				},
			],
		});
		process.exit(1);
		return;
	}

	printSection(
		`${options.dryRun ? "[dry run] " : ""}Creating packages/${libName}`,
	);

	// 2 real steps + done marker = 2 meaningful steps
	const step = createStepRunner(2, options.dryRun);

	await step("Scaffold package structure", async () => {
		await ensureDir(libDir);

		const isPublic = visibility === "public";
		await writeJson(path.join(libDir, "package.json"), {
			name: scopedPackageName(scope, libName),
			version: "0.0.1",
			...(isPublic ? {} : { private: true }),
			type: "module",
			// Always include exports — omitting it loses sub-path support and
			// gives bundlers no encapsulation contract.
			exports: {
				".": {
					import: "./dist/index.js",
					types: "./dist/index.d.ts",
				},
			},
			main: "./dist/index.js",
			types: "./dist/index.d.ts",
			scripts: {
				build: "tsc -p tsconfig.json",
				"build:watch": "tsc -p tsconfig.json --watch",
				typecheck: "tsc --noEmit",
			},
			...(isPublic
				? {
						files: ["dist"],
						publishConfig: { access: "public" },
				  }
				: {}),
			devDependencies: {
				typescript: "^5.6.0",
			},
		});

		// Use the react flag for hooks libs (they need jsx + DOM)
		const needsReact = libType === "hooks";
		await writeJson(
			path.join(libDir, "tsconfig.json"),
			packageTsConfig({ scope, pkgName: libName, visibility, react: needsReact }),
		);

		await writeFile(
			path.join(libDir, "index.ts"),
			getIndexContent(libName, libType, scope),
		);
	});

	await step("Verify workspace registration", async () => {
		// pnpm-workspace.yaml / root package.json workspaces already covers packages/*
		// from init. Nothing to write — just confirm the dir exists so the PM picks it up.
		if (!(await pathExists(libDir))) {
			throw new Error(`packages/${libName} directory was not created`);
		}
	});

	printSuccess({
		title: `packages/${libName} created`,
		commands: [
			{
				cmd: `import { ... } from "${scopedPackageName(scope, libName)}";`,
				comment: "use in any app",
			},
			{
				cmd: `${pm} nx build ${scopedPackageName(scope, libName)}`,
				comment: "build the package",
			},
		],
		tips: [
			{
				label: "Add to an app's dependencies:",
				cmd: `"${scopedPackageName(scope, libName)}": "${pmWorkspaceProtocol(pm)}"`,
			},
			...(visibility === "public"
				? [
						{
							label: "Publish to npm:",
							cmd: `${pm} nx build ${scopedPackageName(scope, libName)} && cd packages/${libName} && npm publish`,
						},
					]
				: []),
		],
	});
}

function getIndexContent(name: string, type: LibType, scope: string): string {
	switch (type) {
		case "utils":
			return `// ${scopedPackageName(scope, name)} — shared utility functions

export function noop(): void {}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
`;
		case "hooks":
			return `// ${scopedPackageName(scope, name)} — shared React hooks
// Note: add react as a peerDependency if you use hooks

export function useNoop(): void {}
`;
		case "config":
			return `// ${scopedPackageName(scope, name)} — shared configuration

export const config = {
  env: process.env.NODE_ENV ?? "development",
} as const;
`;
		case "types":
			return `// ${scopedPackageName(scope, name)} — shared TypeScript types

export type ID = string;

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}
`;
		case "api":
			return `// ${scopedPackageName(scope, name)} — shared API client

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${url}\`);
  return res.json() as Promise<T>;
}
`;
	}
}
