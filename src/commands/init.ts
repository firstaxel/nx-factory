import inquirer from "inquirer";
import path from "path";
import { run, runInDir, pmAdd, pmx, pmxArgs, pmWorkspaceProtocol } from "../exec.js";
import { writeJson, writeFile, ensureDir } from "../files.js";
import { saveConfig } from "../config.js";
import { scaffoldExampleApp } from "./add-app.js";
import {
	c,
	q,
	detected,
	createStepRunner,
	printSection,
	printSuccess,
	printWarn,
} from "../ui.js";

interface InitOptions {
	name?:       string;
	pkgManager?: string;
	yes?:        boolean;
	dryRun?:     boolean;
}

const TOTAL_STEPS = 8;

export async function initCommand(options: InitOptions): Promise<void> {
	if (options.dryRun) {
		printSection("Dry run — no files will be written");
	}

	// ─── Prompts ──────────────────────────────────────────────────────────────
	const defaults = {
		workspaceName:     options.name       ?? "my-monorepo",
		pkgManager:        options.pkgManager ?? "pnpm",
		uiPackageName:     "ui",
		initialComponents: [] as string[],
		addExampleApp:     true,
		baseColor:         "neutral" as string,
	};

	const answers = options.yes
		? defaults
		: await inquirer.prompt([
			{
				type:     "input",
				name:     "workspaceName",
				message:  q("Workspace name", "lowercase letters, numbers, dashes only"),
				default:  defaults.workspaceName,
				validate: (v: string) =>
					/^[a-z0-9-]+$/.test(v) || c.red("Only lowercase letters, numbers, and dashes allowed"),
			},
			{
				type:    "list",
				name:    "pkgManager",
				message: q("Package manager"),
				default: options.pkgManager
					? detected(options.pkgManager)
					: defaults.pkgManager,
				choices: ["pnpm", "npm", "yarn", "bun"],
				when:    !options.pkgManager,
			},
			{
				type:     "input",
				name:     "uiPackageName",
				message:  q("Shared UI package name", "lives at packages/<name>"),
				default:  defaults.uiPackageName,
				validate: (v: string) =>
					/^[a-z0-9-]+$/.test(v) || c.red("Only lowercase letters, numbers, and dashes"),
			},
			{
				type:    "list",
				name:    "baseColor",
				message: q("Base color theme", "sets the shadcn/ui CSS variable palette"),
				choices: [
					{ name: "neutral  — clean gray (default)", value: "neutral" },
					{ name: "zinc     — warm gray",             value: "zinc"    },
					{ name: "slate    — cool blue-gray",        value: "slate"   },
					{ name: "stone    — earthy warm gray",      value: "stone"   },
					{ name: "gray     — pure gray",             value: "gray"    },
				],
				default: defaults.baseColor,
			},
			{
				type:    "checkbox",
				name:    "initialComponents",
				message: q("Pre-install shadcn components", "space to toggle · enter to confirm"),
				choices: ["button", "card", "dialog", "input", "label", "select", "separator", "toast", "tooltip", "badge"],
			},
			{
				type:    "confirm",
				name:    "addExampleApp",
				message: q("Scaffold an example Next.js app?"),
				default: defaults.addExampleApp,
			},
		]);

	const pm                = (answers.pkgManager ?? options.pkgManager ?? "pnpm") as string;
	const workspaceName     = answers.workspaceName as string;
	const uiPkgName         = answers.uiPackageName as string;
	const baseColor         = (answers.baseColor ?? "neutral") as string;
	const initialComponents = answers.initialComponents as string[];
	const addExampleApp     = answers.addExampleApp as boolean;
	const cwd               = path.join(process.cwd(), workspaceName);

	const totalSteps = TOTAL_STEPS + (initialComponents.length > 0 ? 1 : 0) + (addExampleApp ? 1 : 0);
	const step = createStepRunner(totalSteps, options.dryRun);

	printSection(`${options.dryRun ? "[dry run] " : ""}Creating workspace at ./${workspaceName}`);

	// ─── Steps ────────────────────────────────────────────────────────────────
	await step("Create Nx workspace", () =>
		run("npx", [
			"--yes", "create-nx-workspace@latest", workspaceName,
			"--preset=ts", `--packageManager=${pm}`,
			"--nxCloud=skip", "--no-interactive",
		]),
	);

	await step("Write workspace config", async () => {
		if (pm === "pnpm") {
			await writeFile(
				path.join(cwd, "pnpm-workspace.yaml"),
				`packages:\n  - 'packages/*'\n  - 'apps/*'\n`,
			);
		} else if (pm === "yarn") {
			const fs = await import("fs-extra");
			const rootPkgPath = path.join(cwd, "package.json");
			try {
				const rootPkg = await fs.default.readJson(rootPkgPath);
				rootPkg.workspaces = ["packages/*", "apps/*"];
				await fs.default.writeJson(rootPkgPath, rootPkg, { spaces: 2 });
			} catch { /* nx will write it */ }
		}
		await ensureDir(path.join(cwd, "packages"));
		await ensureDir(path.join(cwd, "apps"));
	});

	await step(`Scaffold packages/${uiPkgName}`, () =>
		scaffoldUiPackage(cwd, uiPkgName, pm),
	);

	await step("Install Tailwind v4", () =>
		installUiDeps(cwd, uiPkgName, pm),
	);

	await step("Write shadcn config", async () => {
		await writeShadcnConfig(cwd, uiPkgName, baseColor);
		await writeTailwindCss(cwd, uiPkgName, baseColor);
		await writeTsupConfig(cwd, uiPkgName);
	});

	if (initialComponents.length > 0) {
		await step(`Add shadcn components (${initialComponents.join(", ")})`, () =>
			installShadcnComponents(cwd, uiPkgName, pm, initialComponents),
		);
	}

	await step("Update nx.json", () => updateNxJson(cwd, uiPkgName));

	if (addExampleApp) {
		await step("Scaffold example Next.js app", () =>
			scaffoldExampleApp(cwd, "example-app", uiPkgName, pm),
		);
	}

	await step("Install all dependencies", async () => {
		try {
			await runInDir(cwd, pm, ["install"]);
		} catch {
			printWarn(
				"Dependency install failed",
				`Run \`${pm} install\` manually inside ${workspaceName}/`,
			);
		}
	});

	await step("Save workspace config", async () => {
		if (!options.dryRun) {
			await saveConfig({
				workspaceName,
				pkgManager: pm as "pnpm" | "npm" | "yarn" | "bun",
				uiPackage:  uiPkgName,
				version:    "1.0.0",
			});
		}
	});

	// ─── Done ─────────────────────────────────────────────────────────────────
	printSuccess({
		title: `${workspaceName} ready`,
		commands: [
			{ cmd: `cd ${workspaceName}` },
			...(addExampleApp
				? [{ cmd: `${pm} dev --filter=example-app`, comment: "start the example app" }]
				: []),
			{ cmd: `${pm} nx build @workspace/${uiPkgName}`, comment: "build the UI package" },
		],
		tips: [
			{ label: "Add more components:", cmd: `nx-shadcn add-component button card` },
			{ label: "Add a new app:",       cmd: `nx-shadcn add-app --name dashboard --framework vite` },
		],
	});
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function scaffoldUiPackage(
	cwd: string,
	uiPkgName: string,
	pm: string,
): Promise<void> {
	const pkgDir = path.join(cwd, "packages", uiPkgName);

	await ensureDir(path.join(pkgDir, "src/components"));
	await ensureDir(path.join(pkgDir, "src/lib"));
	await ensureDir(path.join(pkgDir, "src/styles"));

	// package.json for the UI package
	await writeJson(path.join(pkgDir, "package.json"), {
		name: `@workspace/${uiPkgName}`,
		version: "0.0.1",
		private: true,
		type: "module",
		exports: {
			".": {
				import: "./dist/index.js",
				types: "./dist/index.d.ts",
			},
			"./styles": "./src/styles/globals.css",
		},
		main: "./dist/index.js",
		types: "./dist/index.d.ts",
		scripts: {
			build: "tsup",
			"build:watch": "tsup --watch",
			lint: "eslint src/",
		},
		peerDependencies: {
			react: "^18 || ^19",
			"react-dom": "^18 || ^19",
		},
		devDependencies: {
			"@types/react": "^19.0.0",
			"@types/react-dom": "^19.0.0",
			react: "^19.0.0",
			"react-dom": "^19.0.0",
			tsup: "^8.3.0",
			typescript: "^5.6.0",
		},
		dependencies: {
			"class-variance-authority": "^0.7.1",
			clsx: "^2.1.1",
			"lucide-react": "^0.454.0",
			"tailwind-merge": "^2.5.4",
		},
	});

	// tsconfig.json
	await writeJson(path.join(pkgDir, "tsconfig.json"), {
		compilerOptions: {
			target: "ES2022",
			module: "ESNext",
			moduleResolution: "bundler",
			jsx: "react-jsx",
			strict: true,
			declaration: true,
			declarationMap: true,
			sourceMap: true,
			esModuleInterop: true,
			skipLibCheck: true,
			outDir: "dist",
			rootDir: "src",
			baseUrl: ".",
			paths: {
				"@/*": ["./src/*"],
			},
		},
		include: ["src"],
		exclude: ["node_modules", "dist"],
	});

	// src/lib/utils.ts (cn helper)
	await writeFile(
		path.join(pkgDir, "src/lib/utils.ts"),
		`import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
	);

	// src/index.ts — barrel export
	await writeFile(
		path.join(pkgDir, "src/index.ts"),
		`// Auto-generated barrel — add new component exports here
// Example: export { Button, type ButtonProps } from "./components/button";
export { cn } from "./lib/utils";
`,
	);
}

async function installUiDeps(
	cwd: string,
	uiPkgName: string,
	pm: string,
): Promise<void> {
	const pkgDir = path.join(cwd, "packages", uiPkgName);
	const addCmd = pmAdd(pm);
	await runInDir(
		pkgDir,
		pm,
		[addCmd, "tailwindcss@^4.0.0", "@tailwindcss/vite@^4.0.0"],
		"Installing Tailwind v4",
	);
	await runInDir(
		pkgDir,
		pm,
		[addCmd, "-D", "tw-animate-css"],
		"Installing tw-animate-css",
	);
}

async function writeShadcnConfig(
	cwd: string,
	uiPkgName: string,
	baseColor = "neutral",
): Promise<void> {
	const pkgDir = path.join(cwd, "packages", uiPkgName);
	await writeJson(path.join(pkgDir, "components.json"), {
		$schema: "https://ui.shadcn.com/schema.json",
		style: "new-york",
		rsc: false,
		tsx: true,
		tailwind: {
			config: "",
			css: "src/styles/globals.css",
			baseColor,
			cssVariables: true,
		},
		aliases: {
			components: "@/components",
			utils: "@/lib/utils",
			ui: "@/components/ui",
			lib: "@/lib",
			hooks: "@/hooks",
		},
		iconLibrary: "lucide",
	});
}

// ─── Theme palettes (oklch values per shadcn base color) ─────────────────────
const THEME_PALETTES: Record<string, { light: Record<string, string>; dark: Record<string, string> }> = {
	neutral: {
		light: {
			radius: "0.625rem", background: "oklch(1 0 0)", foreground: "oklch(0.145 0 0)",
			card: "oklch(1 0 0)", "card-foreground": "oklch(0.145 0 0)",
			popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.145 0 0)",
			primary: "oklch(0.205 0 0)", "primary-foreground": "oklch(0.985 0 0)",
			secondary: "oklch(0.97 0 0)", "secondary-foreground": "oklch(0.205 0 0)",
			muted: "oklch(0.97 0 0)", "muted-foreground": "oklch(0.556 0 0)",
			accent: "oklch(0.97 0 0)", "accent-foreground": "oklch(0.205 0 0)",
			destructive: "oklch(0.577 0.245 27.325)",
			border: "oklch(0.922 0 0)", input: "oklch(0.922 0 0)", ring: "oklch(0.708 0 0)",
		},
		dark: {
			background: "oklch(0.145 0 0)", foreground: "oklch(0.985 0 0)",
			card: "oklch(0.205 0 0)", "card-foreground": "oklch(0.985 0 0)",
			popover: "oklch(0.205 0 0)", "popover-foreground": "oklch(0.985 0 0)",
			primary: "oklch(0.985 0 0)", "primary-foreground": "oklch(0.205 0 0)",
			secondary: "oklch(0.269 0 0)", "secondary-foreground": "oklch(0.985 0 0)",
			muted: "oklch(0.269 0 0)", "muted-foreground": "oklch(0.708 0 0)",
			accent: "oklch(0.269 0 0)", "accent-foreground": "oklch(0.985 0 0)",
			destructive: "oklch(0.704 0.191 22.216)",
			border: "oklch(1 0 0 / 10%)", input: "oklch(1 0 0 / 15%)", ring: "oklch(0.556 0 0)",
		},
	},
	zinc: {
		light: {
			radius: "0.5rem", background: "oklch(1 0 0)", foreground: "oklch(0.141 0.005 285.823)",
			card: "oklch(1 0 0)", "card-foreground": "oklch(0.141 0.005 285.823)",
			popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.141 0.005 285.823)",
			primary: "oklch(0.21 0.006 285.885)", "primary-foreground": "oklch(0.985 0 0)",
			secondary: "oklch(0.967 0.001 286.375)", "secondary-foreground": "oklch(0.21 0.006 285.885)",
			muted: "oklch(0.967 0.001 286.375)", "muted-foreground": "oklch(0.552 0.016 285.938)",
			accent: "oklch(0.967 0.001 286.375)", "accent-foreground": "oklch(0.21 0.006 285.885)",
			destructive: "oklch(0.577 0.245 27.325)",
			border: "oklch(0.92 0.004 286.32)", input: "oklch(0.92 0.004 286.32)", ring: "oklch(0.705 0.015 286.067)",
		},
		dark: {
			background: "oklch(0.141 0.005 285.823)", foreground: "oklch(0.985 0 0)",
			card: "oklch(0.21 0.006 285.885)", "card-foreground": "oklch(0.985 0 0)",
			popover: "oklch(0.21 0.006 285.885)", "popover-foreground": "oklch(0.985 0 0)",
			primary: "oklch(0.985 0 0)", "primary-foreground": "oklch(0.21 0.006 285.885)",
			secondary: "oklch(0.274 0.006 286.033)", "secondary-foreground": "oklch(0.985 0 0)",
			muted: "oklch(0.274 0.006 286.033)", "muted-foreground": "oklch(0.705 0.015 286.067)",
			accent: "oklch(0.274 0.006 286.033)", "accent-foreground": "oklch(0.985 0 0)",
			destructive: "oklch(0.704 0.191 22.216)",
			border: "oklch(1 0 0 / 10%)", input: "oklch(1 0 0 / 15%)", ring: "oklch(0.552 0.016 285.938)",
		},
	},
	slate: {
		light: {
			radius: "0.5rem", background: "oklch(1 0 0)", foreground: "oklch(0.129 0.042 264.695)",
			card: "oklch(1 0 0)", "card-foreground": "oklch(0.129 0.042 264.695)",
			popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.129 0.042 264.695)",
			primary: "oklch(0.208 0.042 265.755)", "primary-foreground": "oklch(0.984 0.003 247.858)",
			secondary: "oklch(0.968 0.007 247.896)", "secondary-foreground": "oklch(0.208 0.042 265.755)",
			muted: "oklch(0.968 0.007 247.896)", "muted-foreground": "oklch(0.554 0.046 257.417)",
			accent: "oklch(0.968 0.007 247.896)", "accent-foreground": "oklch(0.208 0.042 265.755)",
			destructive: "oklch(0.577 0.245 27.325)",
			border: "oklch(0.929 0.013 255.508)", input: "oklch(0.929 0.013 255.508)", ring: "oklch(0.704 0.04 256.788)",
		},
		dark: {
			background: "oklch(0.129 0.042 264.695)", foreground: "oklch(0.984 0.003 247.858)",
			card: "oklch(0.208 0.042 265.755)", "card-foreground": "oklch(0.984 0.003 247.858)",
			popover: "oklch(0.208 0.042 265.755)", "popover-foreground": "oklch(0.984 0.003 247.858)",
			primary: "oklch(0.984 0.003 247.858)", "primary-foreground": "oklch(0.208 0.042 265.755)",
			secondary: "oklch(0.279 0.041 260.031)", "secondary-foreground": "oklch(0.984 0.003 247.858)",
			muted: "oklch(0.279 0.041 260.031)", "muted-foreground": "oklch(0.704 0.04 256.788)",
			accent: "oklch(0.279 0.041 260.031)", "accent-foreground": "oklch(0.984 0.003 247.858)",
			destructive: "oklch(0.704 0.191 22.216)",
			border: "oklch(1 0 0 / 10%)", input: "oklch(1 0 0 / 15%)", ring: "oklch(0.554 0.046 257.417)",
		},
	},
	stone: {
		light: {
			radius: "0.625rem", background: "oklch(1 0 0)", foreground: "oklch(0.147 0.004 49.25)",
			card: "oklch(1 0 0)", "card-foreground": "oklch(0.147 0.004 49.25)",
			popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.147 0.004 49.25)",
			primary: "oklch(0.216 0.006 56.043)", "primary-foreground": "oklch(0.985 0.001 106.423)",
			secondary: "oklch(0.97 0.001 106.424)", "secondary-foreground": "oklch(0.216 0.006 56.043)",
			muted: "oklch(0.97 0.001 106.424)", "muted-foreground": "oklch(0.553 0.013 58.071)",
			accent: "oklch(0.97 0.001 106.424)", "accent-foreground": "oklch(0.216 0.006 56.043)",
			destructive: "oklch(0.577 0.245 27.325)",
			border: "oklch(0.923 0.003 48.717)", input: "oklch(0.923 0.003 48.717)", ring: "oklch(0.709 0.01 56.259)",
		},
		dark: {
			background: "oklch(0.147 0.004 49.25)", foreground: "oklch(0.985 0.001 106.423)",
			card: "oklch(0.216 0.006 56.043)", "card-foreground": "oklch(0.985 0.001 106.423)",
			popover: "oklch(0.216 0.006 56.043)", "popover-foreground": "oklch(0.985 0.001 106.423)",
			primary: "oklch(0.985 0.001 106.423)", "primary-foreground": "oklch(0.216 0.006 56.043)",
			secondary: "oklch(0.268 0.007 34.298)", "secondary-foreground": "oklch(0.985 0.001 106.423)",
			muted: "oklch(0.268 0.007 34.298)", "muted-foreground": "oklch(0.709 0.01 56.259)",
			accent: "oklch(0.268 0.007 34.298)", "accent-foreground": "oklch(0.985 0.001 106.423)",
			destructive: "oklch(0.704 0.191 22.216)",
			border: "oklch(1 0 0 / 10%)", input: "oklch(1 0 0 / 15%)", ring: "oklch(0.553 0.013 58.071)",
		},
	},
	gray: {
		light: {
			radius: "0.625rem", background: "oklch(1 0 0)", foreground: "oklch(0.13 0 0)",
			card: "oklch(1 0 0)", "card-foreground": "oklch(0.13 0 0)",
			popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.13 0 0)",
			primary: "oklch(0.205 0 0)", "primary-foreground": "oklch(0.985 0 0)",
			secondary: "oklch(0.97 0 0)", "secondary-foreground": "oklch(0.205 0 0)",
			muted: "oklch(0.97 0 0)", "muted-foreground": "oklch(0.556 0 0)",
			accent: "oklch(0.97 0 0)", "accent-foreground": "oklch(0.205 0 0)",
			destructive: "oklch(0.577 0.245 27.325)",
			border: "oklch(0.922 0 0)", input: "oklch(0.922 0 0)", ring: "oklch(0.708 0 0)",
		},
		dark: {
			background: "oklch(0.13 0 0)", foreground: "oklch(0.985 0 0)",
			card: "oklch(0.205 0 0)", "card-foreground": "oklch(0.985 0 0)",
			popover: "oklch(0.205 0 0)", "popover-foreground": "oklch(0.985 0 0)",
			primary: "oklch(0.985 0 0)", "primary-foreground": "oklch(0.205 0 0)",
			secondary: "oklch(0.269 0 0)", "secondary-foreground": "oklch(0.985 0 0)",
			muted: "oklch(0.269 0 0)", "muted-foreground": "oklch(0.708 0 0)",
			accent: "oklch(0.269 0 0)", "accent-foreground": "oklch(0.985 0 0)",
			destructive: "oklch(0.704 0.191 22.216)",
			border: "oklch(1 0 0 / 10%)", input: "oklch(1 0 0 / 15%)", ring: "oklch(0.556 0 0)",
		},
	},
};

function buildCssVars(vars: Record<string, string>, indent = "  "): string {
	return Object.entries(vars)
		.map(([k, v]) => `${indent}--${k}: ${v};`)
		.join("\n");
}

async function writeTailwindCss(cwd: string, uiPkgName: string, baseColor = "neutral"): Promise<void> {
	const pkgDir  = path.join(cwd, "packages", uiPkgName);
	const palette = THEME_PALETTES[baseColor] ?? THEME_PALETTES.neutral;
	const { radius, ...lightVars } = palette.light;

	await writeFile(
		path.join(pkgDir, "src/styles/globals.css"),
		`@import "tailwindcss";
@import "tw-animate-css";

/*
 * Tell Tailwind v4 where to scan for utility classes.
 *
 * @source covers:
 *   - This UI package's own components
 *   - Any app in apps/ that imports from @workspace/${uiPkgName}
 *
 * Apps can extend this by adding their own @source lines in their
 * local globals.css after importing this file.
 */
@source "../components/**/*.{ts,tsx}";
@source "../../../apps/*/src/**/*.{ts,tsx,js,jsx}";
@source "../../../apps/*/app/**/*.{ts,tsx,js,jsx}";
@source "../../../apps/*/components/**/*.{ts,tsx,js,jsx}";
@source "../../../apps/*/pages/**/*.{ts,tsx,js,jsx}";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

:root {
  --radius: ${radius ?? "0.625rem"};
${buildCssVars(lightVars)}
}

.dark {
${buildCssVars(palette.dark)}
}
`,
	);
}

async function writeTsupConfig(cwd: string, uiPkgName: string): Promise<void> {
	const pkgDir = path.join(cwd, "packages", uiPkgName);
	await writeFile(
		path.join(pkgDir, "tsup.config.ts"),
		`import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  treeshake: true,
  splitting: false,
});
`,
	);
}

async function installShadcnComponents(
	cwd: string,
	uiPkgName: string,
	pm: string,
	components: string[],
): Promise<void> {
	const pkgDir = path.join(cwd, "packages", uiPkgName);
	try {
		await runInDir(
			pkgDir,
			pmx(pm),
			pmxArgs(pm, "shadcn@latest", ["add", "--yes", ...components]),
		);
		await updateBarrelExports(pkgDir, components);
	} catch {
		printWarn(
			"Failed to add shadcn components",
			"Add them manually later with: nx-shadcn add-component",
		);
	}
}

async function updateBarrelExports(pkgDir: string, components: string[]): Promise<void> {
	const indexPath = path.join(pkgDir, "src/index.ts");
	const { default: fs } = await import("fs-extra");
	let existing = "";
	try {
		existing = await fs.readFile(indexPath, "utf-8");
	} catch {
		// file doesn't exist yet — start fresh
	}
	const newExports = components
		.filter((c) => !existing.includes(`./components/ui/${c}`))
		.map((c) => `export * from "./components/ui/${c}";`)
		.join("\n");
	if (newExports) {
		if (existing && !existing.endsWith("\n")) existing += "\n";
		await writeFile(indexPath, existing + newExports + "\n");
	}
}

async function updateNxJson(cwd: string, uiPkgName: string): Promise<void> {
	const nxJsonPath = path.join(cwd, "nx.json");
	try {
		const fs = await import("fs-extra");
		const nxJson = await fs.default.readJson(nxJsonPath);
		nxJson.targetDefaults = {
			...(nxJson.targetDefaults ?? {}),
			build: {
				dependsOn: ["^build"],
				outputs: ["{projectRoot}/dist"],
				cache: true,
			},
		};
		nxJson.workspaceLayout = { appsDir: "apps", libsDir: "packages" };
		await fs.default.writeJson(nxJsonPath, nxJson, { spaces: 2 });
	} catch {
		// nx.json may not exist yet — skip
	}
}


