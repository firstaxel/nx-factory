import path from "path";
import { writeJson } from "../../files.js";
import { scopedPackageName } from "../../config.js";
import type { AuthPackageScaffolder } from "./types.js";

/**
 * Writes the boilerplate every auth package needs:
 *   packages/auth/package.json
 *   packages/auth/tsconfig.json
 *
 * The caller (provider scaffolder) writes the  files on top of this.
 */
export async function writeAuthPackageBase(
	pkgDir: string,
	scaffolder: AuthPackageScaffolder,
	scope: string,
): Promise<void> {
	const authPackageName = scopedPackageName(scope, "auth");

	// ── package.json ────────────────────────────────────────────────────────────
	await writeJson(path.join(pkgDir, "package.json"), {
		name: authPackageName,
		version: "0.0.1",
		private: true,
		type: "module",
		exports: {
			".": {
				import: "./dist/index.js",
				types: "./dist/index.d.ts",
			},
			// Named sub-paths so apps can do:  import { ... } from "@workspace/auth/server"
			"./server": {
				import: "./dist/server.js",
				types: "./dist/server.d.ts",
			},
			"./client": {
				import: "./dist/client.js",
				types: "./dist/client.d.ts",
			},
			"./middleware": {
				import: "./dist/middleware.js",
				types: "./dist/middleware.d.ts",
			},
			"./next": {
				import: "./dist/next.js",
				types: "./dist/next.d.ts",
			},
		},
		main: "./dist/index.js",
		types: "./dist/index.d.ts",
		scripts: {
			build: "tsc -p tsconfig.json",
			"build:watch": "tsc -p tsconfig.json --watch",
			typecheck: "tsc --noEmit",
		},
		dependencies: scaffolder.dependencies,
		devDependencies: {
			...scaffolder.devDependencies,
			typescript: "^5.6.0",
		},
		peerDependencies: scaffolder.peerDependencies,
	});

	// ── tsconfig.json ───────────────────────────────────────────────────────────
	await writeJson(path.join(pkgDir, "tsconfig.json"), {
		extends: "../../tsconfig.base.json",
		compilerOptions: {
			target: "ES2022",
			module: "ESNext",
			moduleResolution: "bundler",
			jsx: "react-jsx",
			lib: ["ES2022", "DOM"],
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
}
