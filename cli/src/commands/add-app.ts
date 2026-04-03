import inquirer from "inquirer";
import path from "path";
import { pathExists, writeFile, readJson } from "../files.js";
import {
	pmWorkspaceProtocol,
	detectPackageManager,
	pmx,
	pmxArgs,
	runInteractive,
} from "../exec.js";
import { loadConfig, resolveScope, scopedPackageName } from "../config.js";
import {
	requireMonorepoRoot,
	MonorepoRootNotFoundError,
} from "../resolve-root.js";
import {
	q,
	detected,
	createStepRunner,
	printSection,
	printSuccess,
	printError,
	c,
} from "../ui.js";

interface AddAppOptions {
	name?: string;
	framework?: string;
	yes?: boolean;
	dryRun?: boolean;
}

interface WorkspacePackageJson {
	name?: string;
	workspaces?: string[] | { packages: string[] };
}

export async function addAppCommand(options: AddAppOptions): Promise<void> {
	// ── Resolve monorepo root from wherever the user invokes this ──────────────
	let workspaceRoot: string;
	try {
		workspaceRoot = await requireMonorepoRoot();
	} catch (err) {
		if (err instanceof MonorepoRootNotFoundError) {
			printError({
				title: "Could not find monorepo root",
				detail: String(err),
				recovery: [
					{
						label: "Run from inside your nx-factory-cli workspace:",
						cmd: "cd <monorepo-root>",
					},
				],
			});
		} else {
			printError({
				title: "Unexpected error",
				detail: String(err),
				recovery: [
					{ label: "", cmd: "cd <monorepo-root> && nx-factory-cli add-app" },
				],
			});
		}
		process.exit(1);
	}

	const pkgJsonPath = path.join(workspaceRoot, "package.json");
	if (!(await pathExists(pkgJsonPath))) {
		printError({
			title: "No package.json found at workspace root",
			detail: `Resolved root: ${workspaceRoot}`,
			recovery: [{ label: "", cmd: "nx-factory-cli init" }],
		});
		process.exit(1);
	}

	await readJson<WorkspacePackageJson>(pkgJsonPath);

	const cfg = await loadConfig();
	const scope = resolveScope(cfg);

	const packagesDir = path.join(workspaceRoot, "packages");
	let detectedUiPkg = cfg?.uiPackage ?? "ui";
	if (!cfg && (await pathExists(packagesDir))) {
		const { default: fs } = await import("fs-extra");
		const pkgs = await fs.readdir(packagesDir);
		if (pkgs.length > 0) detectedUiPkg = pkgs[0];
	}

	const detectedPm = await detectPackageManager(workspaceRoot);

	const defaults = {
		appName: options.name ?? "my-app",
		framework: options.framework ?? "nextjs",
		uiPkgName: detectedUiPkg,
		pkgManager: detectedPm ?? cfg?.pkgManager ?? "pnpm",
	};

	const answers = options.yes
		? defaults
		: await inquirer.prompt([
				{
					type: "input",
					name: "appName",
					message: q("App name", "lowercase letters, numbers, dashes only"),
					default: defaults.appName,
					validate: (v: string) =>
						/^[a-z0-9-]+$/.test(v) ||
						c.red("Only lowercase letters, numbers, and dashes"),
				},
				{
					type: "select",
					name: "framework",
					message: q("Framework"),
					choices: [
						{ name: "Next.js  — create-next-app@latest", value: "nextjs" },
						{ name: "Vite     — create-vite@latest", value: "vite" },
						{ name: "Remix    — create-remix@latest", value: "remix" },
						{ name: "Expo     — create-expo-app@latest", value: "expo" },
					],
					default: defaults.framework,
					when: !options.framework,
				},
				{
					type: "input",
					name: "uiPkgName",
					message: q("Shared UI package name"),
					default: defaults.uiPkgName,
				},
				{
					type: "select",
					name: "pkgManager",
					message: q("Package manager"),
					choices: ["pnpm", "npm", "yarn", "bun"],
					default: detectedPm ? detected(detectedPm) : defaults.pkgManager,
					when: !detectedPm,
				},
			]);

	const appName = (answers.appName ?? defaults.appName) as string;
	const framework = (answers.framework ?? defaults.framework) as string;
	const uiPkgName = (answers.uiPkgName ?? defaults.uiPkgName) as string;
	const pm = (answers.pkgManager ??
		detectedPm ??
		defaults.pkgManager) as string;
	const appsDir = path.join(workspaceRoot, "apps");
	const appDir = path.join(appsDir, appName);

	if (await pathExists(appDir)) {
		printError({
			title: `apps/${appName} already exists`,
			recovery: [
				{
					label: "Choose a different name or delete the existing directory:",
					cmd: `rm -rf apps/${appName}`,
				},
			],
		});
		process.exit(1);
	}

	// ─── Dry run ────────────────────────────────────────────────────────────────
	if (options.dryRun) {
		printSection(`[dry run] Scaffolding ${framework} app → apps/${appName}`);
		const step = createStepRunner(3, true);
		await step(`Run ${frameworkCliName(framework)}`, async () => {});
		await step(
			`Add ${scopedPackageName(scope, uiPkgName)} dependency`,
			async () => {},
		);
		await step("Patch framework config for shared UI styles", async () => {});
		printSuccess({
			title: `apps/${appName} ready (dry run — nothing written)`,
			commands: [
				{ cmd: `${pm} install` },
				{ cmd: devCmd(framework, pm, appName), comment: "start the app" },
			],
		});
		return;
	}

	// ─── Real scaffold ──────────────────────────────────────────────────────────
	printSection(`Scaffolding ${framework} app → apps/${appName}`);
	const step = createStepRunner(3);

	await step(`Run ${frameworkCliName(framework)}`, async () => {
		await scaffoldViaCli(framework, appName, appsDir, pm);
	});

	await step(
		`Add ${scopedPackageName(scope, uiPkgName)} dependency`,
		async () => {
			await addUiDependency(appDir, uiPkgName, pm, scope);
		},
	);

	await step("Patch config for shared UI styles", async () => {
		await patchConfig(framework, appDir, uiPkgName, scope);
	});

	printSuccess({
		title: `apps/${appName} created`,
		commands: [
			{ cmd: `${pm} install`, comment: "install workspace deps" },
			{
				cmd: devCmd(framework, pm, appName),
				comment:
					framework === "expo" ? "start Expo dev server" : "start the app",
			},
		],
		tips: [
			{ label: "Add auth:", cmd: "nx-factory-cli add-auth" },
			...(framework === "expo"
				? [
						{
							label: "Note:",
							cmd: "Expo uses NativeWind — shadcn components are web-only",
						},
					]
				: []),
		],
	});
}

// ─── CLI runner ───────────────────────────────────────────────────────────────

async function scaffoldViaCli(
	framework: string,
	appName: string,
	appsDir: string,
	pm: string,
): Promise<void> {
	const { default: fs } = await import("fs-extra");
	await fs.ensureDir(appsDir);

	switch (framework) {
		case "nextjs":
			await runInteractive(
				pmx(pm),
				pmxArgs(pm, "create-next-app@latest", [
					appName,
					"--ts",
					"--tailwind",
					"--eslint",
					"--app",
					"--src-dir",
					"--no-import-alias",
					`--use-${pm === "bun" ? "bun" : pm === "yarn" ? "yarn" : pm === "npm" ? "npm" : "pnpm"}`,
				]),
				{ cwd: appsDir },
			);
			break;
		case "vite":
			await runInteractive(
				pmx(pm),
				pmxArgs(pm, "create-vite@latest", [appName, "--template", "react-ts"]),
				{ cwd: appsDir },
			);
			break;
		case "remix":
			await runInteractive(
				pmx(pm),
				pmxArgs(pm, "create-remix@latest", [appName, "--yes"]),
				{ cwd: appsDir },
			);
			break;
		case "expo":
			await runInteractive(
				pmx(pm),
				pmxArgs(pm, "create-expo-app@latest", [
					appName,
					"--template",
					"blank-typescript",
					"--no-install",
				]),
				{ cwd: appsDir },
			);
			break;
	}
}

// ─── Add UI package dep ───────────────────────────────────────────────────────

async function addUiDependency(
	appDir: string,
	uiPkgName: string,
	pm: string,
	scope: string,
): Promise<void> {
	const pkgJsonPath = path.join(appDir, "package.json");
	const { default: fs } = await import("fs-extra");
	if (!(await pathExists(pkgJsonPath))) {
		throw new Error(
			`package.json not found in ${appDir} — did the CLI scaffold succeed?`,
		);
	}
	const pkgJson = await fs.readJson(pkgJsonPath);
	pkgJson.dependencies = {
		...pkgJson.dependencies,
		[scopedPackageName(scope, uiPkgName)]: pmWorkspaceProtocol(pm),
	};
	await fs.writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
}

// ─── Config patching ──────────────────────────────────────────────────────────

async function patchConfig(
	framework: string,
	appDir: string,
	uiPkgName: string,
	scope: string,
): Promise<void> {
	switch (framework) {
		case "nextjs":
			await patchNextConfig(appDir, uiPkgName, scope);
			break;
		case "vite":
			await patchViteConfig(appDir, uiPkgName, scope);
			break;
		case "remix":
			await patchRemixConfig(appDir, uiPkgName, scope);
			break;
		case "expo":
			await patchExpoConfig(appDir, scope);
			break;
	}
}

async function patchNextConfig(
	appDir: string,
	uiPkgName: string,
	scope: string,
): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const uiPackageName = scopedPackageName(scope, uiPkgName);
	for (const cfgFile of [
		"next.config.ts",
		"next.config.js",
		"next.config.mjs",
	]) {
		const cfgPath = path.join(appDir, cfgFile);
		if (!(await pathExists(cfgPath))) continue;
		let src = await fs.readFile(cfgPath, "utf-8");
		if (src.includes("transpilePackages")) {
			if (!src.includes(uiPackageName)) {
				src = src.replace(
					/transpilePackages:\s*\[/,
					`transpilePackages: ["${uiPackageName}", `,
				);
			}
		} else {
			src = src.replace(
				/(const nextConfig[^=]*=\s*\{)/,
				`$1\n  transpilePackages: ["${uiPackageName}"],`,
			);
		}
		await fs.writeFile(cfgPath, src, "utf-8");
		break;
	}
	for (const layoutRel of [
		"src/app/layout.tsx",
		"app/layout.tsx",
		"src/app/layout.jsx",
	]) {
		const layoutPath = path.join(appDir, layoutRel);
		if (!(await pathExists(layoutPath))) continue;
		let src = await fs.readFile(layoutPath, "utf-8");
		if (!src.includes(uiPackageName)) {
			src = src.replace(
				/((?:^import[^\n]+\n)+)/m,
				`$1import "${uiPackageName}/styles/globals.css";\n`,
			);
			await fs.writeFile(layoutPath, src, "utf-8");
		}
		break;
	}
	for (const cssRel of ["src/app/globals.css", "app/globals.css"]) {
		const cssPath = path.join(appDir, cssRel);
		if (!(await pathExists(cssPath))) continue;
		let css = await fs.readFile(cssPath, "utf-8");
		if (!css.includes("@source")) {
			css = `/* Ensure Tailwind scans this app's source files */\n@import "${uiPackageName}/styles/globals.css";\n\n${css}`;
			await fs.writeFile(cssPath, css, "utf-8");
		}
		break;
	}
	await patchAppTsConfig(appDir, scope);
}

async function patchViteConfig(
	appDir: string,
	uiPkgName: string,
	scope: string,
): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const uiPackageName = scopedPackageName(scope, uiPkgName);
	for (const cfgFile of ["vite.config.ts", "vite.config.js"]) {
		const cfgPath = path.join(appDir, cfgFile);
		if (!(await pathExists(cfgPath))) continue;
		let src = await fs.readFile(cfgPath, "utf-8");
		if (!src.includes("@tailwindcss/vite") && !src.includes("tailwindcss")) {
			src = `import tailwindcss from "@tailwindcss/vite";\n${src}`;
			src = src.replace(/plugins:\s*\[/, `plugins: [tailwindcss(), `);
			await fs.writeFile(cfgPath, src, "utf-8");
		}
		break;
	}
	const pkgPath = path.join(appDir, "package.json");
	if (await pathExists(pkgPath)) {
		const pkg = await fs.readJson(pkgPath);
		pkg.devDependencies = {
			...pkg.devDependencies,
			"@tailwindcss/vite": "^4.0.0",
		};
		await fs.writeJson(pkgPath, pkg, { spaces: 2 });
	}
	for (const mainRel of ["src/main.tsx", "src/main.jsx", "src/main.ts"]) {
		const mainPath = path.join(appDir, mainRel);
		if (!(await pathExists(mainPath))) continue;
		let src = await fs.readFile(mainPath, "utf-8");
		if (!src.includes(uiPackageName)) {
			src = `import "${uiPackageName}/styles/globals.css";\n${src}`;
			await fs.writeFile(mainPath, src, "utf-8");
		}
		break;
	}
	await patchAppTsConfig(appDir, scope);
}

async function patchRemixConfig(
	appDir: string,
	uiPkgName: string,
	scope: string,
): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const uiPackageName = scopedPackageName(scope, uiPkgName);
	for (const cfgFile of ["vite.config.ts", "vite.config.js"]) {
		const cfgPath = path.join(appDir, cfgFile);
		if (!(await pathExists(cfgPath))) continue;
		let src = await fs.readFile(cfgPath, "utf-8");
		if (!src.includes("@tailwindcss/vite") && !src.includes("tailwindcss")) {
			src = `import tailwindcss from "@tailwindcss/vite";\n${src}`;
			src = src.replace(/plugins:\s*\[/, `plugins: [tailwindcss(), `);
			await fs.writeFile(cfgPath, src, "utf-8");
		}
		break;
	}
	const pkgPath = path.join(appDir, "package.json");
	if (await pathExists(pkgPath)) {
		const pkg = await fs.readJson(pkgPath);
		pkg.devDependencies = {
			...pkg.devDependencies,
			"@tailwindcss/vite": "^4.0.0",
		};
		await fs.writeJson(pkgPath, pkg, { spaces: 2 });
	}
	for (const rootRel of ["app/root.tsx", "app/root.jsx"]) {
		const rootPath = path.join(appDir, rootRel);
		if (!(await pathExists(rootPath))) continue;
		let src = await fs.readFile(rootPath, "utf-8");
		if (!src.includes(uiPackageName)) {
			src = src.replace(
				/((?:^import[^\n]+\n)+)/m,
				`$1import "${uiPackageName}/styles/globals.css";\n`,
			);
			await fs.writeFile(rootPath, src, "utf-8");
		}
		break;
	}
	await patchAppTsConfig(appDir, scope);
}

async function patchExpoConfig(appDir: string, scope: string): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const pkgPath = path.join(appDir, "package.json");
	if (await pathExists(pkgPath)) {
		const pkg = await fs.readJson(pkgPath);
		pkg.dependencies = {
			...pkg.dependencies,
			nativewind: "^4.0.1",
			tailwindcss: "^3.4.0",
		};
		pkg.devDependencies = {
			...pkg.devDependencies,
			"babel-preset-expo": "~12.0.0",
		};
		await fs.writeJson(pkgPath, pkg, { spaces: 2 });
	}
	await writeFile(
		path.join(appDir, "tailwind.config.js"),
		`/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};\n`,
	);
	await writeFile(
		path.join(appDir, "global.css"),
		`@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
	);
	await writeFile(
		path.join(appDir, "babel.config.js"),
		`module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};\n`,
	);
	for (const layoutRel of ["app/_layout.tsx", "app/_layout.jsx"]) {
		const layoutPath = path.join(appDir, layoutRel);
		if (!(await pathExists(layoutPath))) continue;
		let src = await fs.readFile(layoutPath, "utf-8");
		if (!src.includes("global.css")) {
			src = `import "../global.css";\n${src}`;
			await fs.writeFile(layoutPath, src, "utf-8");
		}
		break;
	}
	await patchAppTsConfig(appDir, scope);
}

async function patchAppTsConfig(appDir: string, scope: string): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const tsConfigPath = path.join(appDir, "tsconfig.json");
	if (!(await pathExists(tsConfigPath))) return;
	const tsConfig = await fs.readJson(tsConfigPath);
	const usesSrcDir = await pathExists(path.join(appDir, "src"));
	tsConfig.extends = "../../tsconfig.base.json";
	const currentPaths = tsConfig.compilerOptions?.paths ?? {};
	tsConfig.compilerOptions = {
		...(tsConfig.compilerOptions ?? {}),
		paths: {
			...currentPaths,
			"@/*": [usesSrcDir ? "./src/*" : "./*"],
			[`@${scope}/*`]: ["../../packages/*"],
		},
	};
	const includeEntries: string[] = Array.isArray(tsConfig.include)
		? tsConfig.include
		: [];
	tsConfig.include = Array.from(
		new Set([
			...includeEntries,
			"../../packages/**/*.ts",
			"../../packages/**/*.tsx",
		]),
	);
	await fs.writeJson(tsConfigPath, tsConfig, { spaces: 2 });
}

function frameworkCliName(framework: string): string {
	switch (framework) {
		case "nextjs":
			return "create-next-app@latest";
		case "vite":
			return "create-vite@latest";
		case "remix":
			return "create-remix@latest";
		case "expo":
			return "create-expo-app@latest";
		default:
			return `create-${framework}@latest`;
	}
}

function devCmd(framework: string, pm: string, appName: string): string {
	if (framework === "expo") return `cd apps/${appName} && ${pm} start`;
	return `${pm} dev --filter=${appName}`;
}

export async function scaffoldExampleApp(
	workspaceRoot: string,
	appName: string,
	uiPkgName: string,
	pm: string,
	scope: string,
): Promise<void> {
	const appsDir = path.join(workspaceRoot, "apps");
	const appDir = path.join(appsDir, appName);
	await scaffoldViaCli("nextjs", appName, appsDir, pm);
	await addUiDependency(appDir, uiPkgName, pm, scope);
	await patchNextConfig(appDir, uiPkgName, scope);
}
