import inquirer from "inquirer";
import path from "path";
import { pathExists, writeJson, writeFile, ensureDir } from "../files.js";
import { loadConfig, resolveScope, scopedPackageName } from "../config.js";
import { detectPackageManager } from "../exec.js";
import {
	c,
	q,
	detected,
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
	// Verify monorepo root
	if (!(await pathExists(path.join(process.cwd(), "package.json")))) {
		printError({
			title: "No package.json found",
			detail: "Run this command from the monorepo root.",
			recovery: [
				{ label: "", cmd: "cd <monorepo-root> && nx-factory-cli add-lib" },
			],
		});
		process.exit(1);
		return;
	}

	const cfg = await loadConfig();
	const scope = resolveScope(cfg);
	const detectedPm = await detectPackageManager();

	const defaults = {
		libName: options.name ?? "shared",
		libType: (options.type ?? "utils") as LibType,
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
					type: "list",
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
					type: "list",
					name: "pm",
					message: q("Package manager"),
					choices: ["pnpm", "npm", "yarn", "bun"],
					default: detectedPm ? detected(detectedPm) : defaults.pm,
					when: !detectedPm,
				},
			]);

	const libName = (answers.libName ?? defaults.libName) as string;
	const libType = (answers.libType ?? defaults.libType) as LibType;
	const pm = (answers.pm ?? detectedPm ?? cfg?.pkgManager ?? "pnpm") as string;
	const libDir = path.join(process.cwd(), "packages", libName);

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

	const step = createStepRunner(3, options.dryRun);

	await step("Scaffold package structure", async () => {
		await ensureDir(path.join(libDir, "."));

		await writeJson(path.join(libDir, "package.json"), {
			name: scopedPackageName(scope, libName),
			version: "0.0.1",
			private: true,
			type: "module",
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
			devDependencies: {
				typescript: "^5.6.0",
			},
		});

		await writeJson(path.join(libDir, "tsconfig.json"), {
			compilerOptions: {
				target: "ES2022",
				module: "ESNext",
				moduleResolution: "bundler",
				strict: true,
				declaration: true,
				declarationMap: true,
				sourceMap: true,
				esModuleInterop: true,
				skipLibCheck: true,
				outDir: "dist",
				rootDir: ".",
			},
			include: ["**/*"],
			exclude: ["node_modules", "dist"],
		});

		// Seed index.ts based on lib type
		await writeFile(
			path.join(libDir, "index.ts"),
			getIndexContent(libName, libType, scope),
		);
	});

	await step(
		`Add ${scopedPackageName(scope, libName)} to workspace`,
		async () => {
			// For pnpm: pnpm-workspace.yaml is already written by init.
			// For npm: the workspaces field in root package.json covers packages/*.
			// Nothing extra to do — the new directory is picked up automatically.
			void pm; // referenced to avoid unused-var warning
		},
	);

	await step("Done", async () => {});

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
				cmd: `"${scopedPackageName(scope, libName)}": "${pm === "npm" ? "*" : "workspace:*"}"`,
			},
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
