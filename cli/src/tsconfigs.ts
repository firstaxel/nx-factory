/**
 * tsconfigs.ts — single source of truth for every tsconfig shape the CLI writes.
 *
 * Rules that govern the choices below:
 *
 * ROOT tsconfig.base.json
 *   "module": "NodeNext" / "moduleResolution": "NodeNext"
 *   — the CLI itself uses NodeNext, and apps compiled by Next.js / tsc directly
 *     also use NodeNext. All relative imports in source must end with .js.
 *   — baseUrl + paths live here so every package and app inherits them without
 *     repeating the mapping.
 *
 * PACKAGE tsconfig.json (internal or public)
 *   Extends ../../tsconfig.base.json — inherits paths, strict, target.
 *   Overrides only what the package specifically needs (jsx, lib, outDir).
 *
 *   Internal  (private: true in package.json)
 *     — no `declaration` / `declarationMap` needed in theory, but we keep them
 *       so IDEs get go-to-definition inside the monorepo.
 *     — composite: true + incremental for fast Nx caching.
 *
 *   Public  (to be published to npm)
 *     — declaration + declarationMap required by consumers.
 *     — composite: true for project references.
 *     — stripInternal: true so @internal JSDoc strips from .d.ts.
 *     — no `rootDir` override needed because extend covers it.
 *
 * APP tsconfig.json
 *   Extends ../../tsconfig.base.json.
 *   Each framework adds its own lib / jsx overrides.
 *   No packages/**\/* in `include` — paths handles resolution, and polluting
 *   include causes duplicate type-checking and false errors.
 */

// PackageVisibility is the canonical type — imported by consumers from config.ts
import type { PackageVisibility } from "./config.js";
export type { PackageVisibility };

// ─── Root workspace tsconfig.base.json ────────────────────────────────────────

export function rootTsConfigBase(scope: string): object {
	return {
		$schema: "https://json.schemastore.org/tsconfig",
		display: "Base",
		compilerOptions: {
			// --- Language & output ---
			target: "ES2022",
			module: "NodeNext",
			moduleResolution: "NodeNext",
			lib: ["ES2022"],
			// --- Strictness ---
			strict: true,
			noUncheckedIndexedAccess: true,
			noImplicitOverride: true,
			exactOptionalPropertyTypes: true,
			// --- Emit ---
			declaration: true,
			declarationMap: true,
			sourceMap: true,
			esModuleInterop: true,
			skipLibCheck: true,
			isolatedModules: true,
			// --- Paths — inherited by every package and app ---
			baseUrl: ".",
			paths: {
				[`@${scope}/*`]: ["./packages/*/index.ts"],
			},
		},
	};
}

// ─── Package tsconfigs ────────────────────────────────────────────────────────

interface PackageTsConfigOptions {
	scope: string;
	pkgName: string;
	visibility: PackageVisibility;
	/** true for React component packages — adds jsx and DOM lib */
	react?: boolean;
	/** Relative path from package dir to workspace root, default "../../" */
	rootRelative?: string;
}

export function packageTsConfig(opts: PackageTsConfigOptions): object {
	const rootRel = opts.rootRelative ?? "../..";
	const base: Record<string, unknown> = {
		$schema: "https://json.schemastore.org/tsconfig",
		extends: `${rootRel}/tsconfig.base.json`,
		compilerOptions: {
			// Packages always emit to dist/
			outDir: "dist",
			rootDir: ".",
			// Composite enables project references and Nx incremental builds
			composite: true,
			incremental: true,
			tsBuildInfoFile: "dist/.tsbuildinfo",
		},
		include: ["**/*.ts", "**/*.tsx"],
		exclude: ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"],
	};

	const co = base.compilerOptions as Record<string, unknown>;

	// React packages need jsx and DOM types
	if (opts.react) {
		co["jsx"] = "react-jsx";
		co["lib"] = ["ES2022", "DOM", "DOM.Iterable"];
	}

	// Public packages get extras for clean npm publishing
	if (opts.visibility === "public") {
		co["stripInternal"] = true; // strips @internal from .d.ts
		co["declarationDir"] = "dist"; // explicit — avoids surprises
	}

	// Internal packages get a self-referencing path so imports within the
	// package can use the scoped name instead of relative paths
	if (opts.visibility === "internal") {
		const existingPaths = (co["paths"] as Record<string, string[]>) ?? {};
		co["paths"] = {
			...existingPaths,
			[`@${opts.scope}/${opts.pkgName}`]: ["./index.ts"],
		};
		co["baseUrl"] = ".";
	}

	return base;
}

// ─── App tsconfigs ────────────────────────────────────────────────────────────

type AppFramework = "nextjs" | "vite" | "remix" | "expo";

interface AppTsConfigOptions {
	scope: string;
	framework: AppFramework;
	hasSrcDir: boolean;
}

export function appTsConfig(opts: AppTsConfigOptions): object {
	const aliasBase = opts.hasSrcDir ? "./src/*" : "./*";

	// Framework-specific compiler option overrides
	const frameworkOverrides = frameworkCompilerOptions(opts.framework);

	return {
		$schema: "https://json.schemastore.org/tsconfig",
		extends: "../../tsconfig.base.json",
		compilerOptions: {
			...frameworkOverrides,
			// App-level alias: @/* → src/* or root
			paths: {
				"@/*": [aliasBase],
				// Workspace packages resolved via inherited baseUrl paths from base
			},
			// Apps don't emit — the framework build tool handles that
			noEmit: true,
		},
		// Only include the app's own source files
		include: [
			opts.hasSrcDir ? "src/**/*.ts" : "**/*.ts",
			opts.hasSrcDir ? "src/**/*.tsx" : "**/*.tsx",
			...(opts.framework === "nextjs"
				? ["next-env.d.ts", ".next/types/**/*.ts"]
				: []),
		],
		exclude: ["node_modules", "dist"],
	};
}

function frameworkCompilerOptions(framework: AppFramework): Record<string, unknown> {
	switch (framework) {
		case "nextjs":
			return {
				lib: ["ES2022", "DOM", "DOM.Iterable"],
				jsx: "preserve",              // Next.js handles JSX transform
				plugins: [{ name: "next" }],  // enables Next.js TS plugin
				allowJs: true,
				incremental: true,
				tsBuildInfoFile: ".next/cache/tsconfig.tsbuildinfo",
			};
		case "vite":
			return {
				lib: ["ES2022", "DOM", "DOM.Iterable"],
				jsx: "react-jsx",
				useDefineForClassFields: true,
			};
		case "remix":
			return {
				lib: ["ES2022", "DOM", "DOM.Iterable"],
				jsx: "react-jsx",
				moduleResolution: "Bundler",   // Remix/Vite uses bundler resolution
				module: "ESNext",
			};
		case "expo":
			return {
				lib: ["ES2022"],
				jsx: "react-native",
				allowSyntheticDefaultImports: true,
			};
	}
}
