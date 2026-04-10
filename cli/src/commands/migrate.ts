import inquirer from "inquirer";
import path from "path";
import { pathExists, readJson, writeJson, writeFile } from "../files.js";
import {
	loadConfig,
	saveConfig,
	resolveScope,
	scopedPackageName,
	type NxShadcnConfig,
	type PackageVisibility,
} from "../config.js";
import { detectPackageManager } from "../exec.js";
import { rootTsConfigBase, packageTsConfig, appTsConfig } from "../tsconfigs.js";
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
	printWarn,
} from "../ui.js";

interface MigrateOptions {
	yes?: boolean;
	dryRun?: boolean;
}

// What the CLI checks for to decide if migration is needed
interface MigrationStatus {
	hasConfig: boolean;
	configVersion: string | null;
	hasTsConfigBase: boolean;
	hasUiPackageVisibility: boolean;
	uiPackageDir: string | null;
	appsWithBadTsConfig: string[];
	packagesWithBadTsConfig: string[];
}

export async function migrateCommand(options: MigrateOptions): Promise<void> {
	// ── Resolve monorepo root ──────────────────────────────────────────────────
	let root: string;
	try {
		root = await requireMonorepoRoot();
	} catch (err) {
		if (err instanceof MonorepoRootNotFoundError) {
			printError({
				title: "Could not find a workspace to migrate",
				detail: String(err),
				recovery: [
					{ label: "Run from inside an nx-factory-cli workspace:", cmd: "cd <workspace-root>" },
					{ label: "Or start fresh:", cmd: "nx-factory-cli init" },
				],
			});
		} else {
			printError({
				title: "Unexpected error",
				detail: String(err),
				recovery: [{ label: "Run from workspace root:", cmd: "cd <workspace-root>" }],
			});
		}
		process.exit(1);
		return;
	}

	printSection("Analysing workspace...");

	// ── Analyse current state ─────────────────────────────────────────────────
	const status = await analyseWorkspace(root);
	printAnalysis(status);

	if (isFullyMigrated(status)) {
		console.log(
			`\n  ${c.green("✓")}  ${c.white("Workspace is already up to date — nothing to migrate.")}\n`,
		);
		return;
	}

	// ── Confirm ───────────────────────────────────────────────────────────────
	const cfg = await loadConfig();
	const scope = resolveScope(cfg);
	const detectedPm = await detectPackageManager(root);
	const pm = detectedPm ?? cfg?.pkgManager ?? "pnpm";

	const answers = options.yes
		? { proceed: true, uiVisibility: "internal" as PackageVisibility }
		: await inquirer.prompt([
				{
					type: "confirm",
					name: "proceed",
					message: q(
						"Apply all migrations?",
						"a backup of each changed file will be written as <file>.migration-backup",
					),
					default: true,
				},
				{
					type: "select",
					name: "uiVisibility",
					message: q(
						"UI package visibility",
						"internal = workspace only · public = published to npm",
					),
					choices: [
						{ name: "internal  — private: true, workspace only", value: "internal" },
						{ name: "public    — will be published to npm", value: "public" },
					],
					default: "internal",
					when: !status.hasUiPackageVisibility,
				},
			]);

	if (!answers.proceed) {
		console.log(c.dim("\n  Migration cancelled.\n"));
		return;
	}

	const uiVisibility = (answers.uiVisibility ?? "internal") as PackageVisibility;

	// ── Count steps dynamically ───────────────────────────────────────────────
	let totalSteps = 0;
	if (!status.hasTsConfigBase) totalSteps++;
	if (!status.hasUiPackageVisibility && status.uiPackageDir) totalSteps++;
	if (status.packagesWithBadTsConfig.length > 0) totalSteps++;
	if (status.appsWithBadTsConfig.length > 0) totalSteps++;
	if (!status.hasConfig || !status.hasUiPackageVisibility) totalSteps++;
	if (totalSteps === 0) totalSteps = 1;

	printSection(
		`${options.dryRun ? "[dry run] " : ""}Migrating workspace at ${root}`,
	);
	const step = createStepRunner(totalSteps, options.dryRun);

	// ── Step 1: Write tsconfig.base.json ──────────────────────────────────────
	if (!status.hasTsConfigBase) {
		await step("Write tsconfig.base.json", async () => {
			const tsBasePath = path.join(root, "tsconfig.base.json");
			await backupIfExists(tsBasePath, options.dryRun);
			await writeJson(tsBasePath, rootTsConfigBase(scope));
		});
	}

	// ── Step 2: Migrate UI package tsconfig + package.json ──────────────────
	if (!status.hasUiPackageVisibility && status.uiPackageDir) {
		const uiPkgName = path.basename(status.uiPackageDir);
		await step(`Migrate packages/${uiPkgName} (tsconfig + package.json)`, async () => {
			const { default: fs } = await import("fs-extra");

			// tsconfig.json
			const tsCfgPath = path.join(status.uiPackageDir!, "tsconfig.json");
			await backupIfExists(tsCfgPath, options.dryRun);
			await writeJson(
				tsCfgPath,
				packageTsConfig({ scope, pkgName: uiPkgName, visibility: uiVisibility, react: true }),
			);

			// package.json — add exports + publishConfig if public, ensure private:true if internal
			const pkgPath = path.join(status.uiPackageDir!, "package.json");
			if (await pathExists(pkgPath)) {
				await backupIfExists(pkgPath, options.dryRun);
				const pkg = await fs.readJson(pkgPath) as Record<string, unknown>;

				if (uiVisibility === "internal") {
					pkg.private = true;
					delete (pkg as Record<string, unknown>).publishConfig;
				} else {
					delete (pkg as Record<string, unknown>).private;
					pkg.publishConfig = { access: "public" };
					pkg.files = ["dist", "styles"];
				}

				// Ensure exports field is present
				if (!pkg.exports) {
					pkg.exports = {
						".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
						"./styles": "./styles/globals.css",
						"./components/*": {
							import: "./dist/components/*.js",
							types: "./dist/components/*.d.ts",
						},
					};
				}

				await fs.writeJson(pkgPath, pkg, { spaces: 2 });
			}
		});
	}

	// ── Step 3: Migrate other packages in packages/ ───────────────────────────
	if (status.packagesWithBadTsConfig.length > 0) {
		await step(
			`Migrate ${status.packagesWithBadTsConfig.length} package tsconfig(s)`,
			async () => {
				for (const pkgName of status.packagesWithBadTsConfig) {
					const pkgDir = path.join(root, "packages", pkgName);
					const tsCfgPath = path.join(pkgDir, "tsconfig.json");
					await backupIfExists(tsCfgPath, options.dryRun);

					// Detect if this package uses React (has @types/react or jsx in existing config)
					let isReact = false;
					try {
						const { default: fs } = await import("fs-extra");
						const existing = await fs.readJson(tsCfgPath) as Record<string, unknown>;
						const co = (existing.compilerOptions ?? {}) as Record<string, unknown>;
						isReact = !!co.jsx;
					} catch { /* no tsconfig — use safe default */ }

					// Detect visibility from package.json
					let visibility: PackageVisibility = "internal";
					try {
						const { default: fs } = await import("fs-extra");
						const pkg = await fs.readJson(path.join(pkgDir, "package.json")) as Record<string, unknown>;
						if (!pkg.private) visibility = "public";
					} catch { /* keep internal */ }

					await writeJson(
						tsCfgPath,
						packageTsConfig({ scope, pkgName, visibility, react: isReact }),
					);
				}
			},
		);
	}

	// ── Step 4: Migrate app tsconfigs ─────────────────────────────────────────
	if (status.appsWithBadTsConfig.length > 0) {
		await step(
			`Migrate ${status.appsWithBadTsConfig.length} app tsconfig(s)`,
			async () => {
				const { default: fs } = await import("fs-extra");
				for (const appName of status.appsWithBadTsConfig) {
					const appDir = path.join(root, "apps", appName);
					const tsCfgPath = path.join(appDir, "tsconfig.json");
					if (!(await pathExists(tsCfgPath))) continue;

					await backupIfExists(tsCfgPath, options.dryRun);

					const hasSrcDir = await pathExists(path.join(appDir, "src"));
					const fw = await detectFrameworkFromAppDir(appDir);
					const generated = appTsConfig({ scope, framework: fw, hasSrcDir });

					// Merge — keep framework-generated keys, override extends + paths + include
					const existing = await fs.readJson(tsCfgPath) as Record<string, unknown>;
					const merged = {
						...existing,
						...generated,
						compilerOptions: {
							...(existing.compilerOptions as object ?? {}),
							...(generated as { compilerOptions: object }).compilerOptions,
						},
					};
					await fs.writeJson(tsCfgPath, merged, { spaces: 2 });
				}
			},
		);
	}

	// ── Step 5: Update nx-factory.config.json ─────────────────────────────────
	if (!status.hasConfig || !status.hasUiPackageVisibility) {
		await step("Update nx-factory.config.json", async () => {
			const uiPkg = cfg?.uiPackage ?? (status.uiPackageDir ? path.basename(status.uiPackageDir) : "ui");
			const updatedCfg: NxShadcnConfig = {
				workspaceName: cfg?.workspaceName ?? path.basename(root),
				scope,
				pkgManager: (pm as NxShadcnConfig["pkgManager"]),
				uiPackage: uiPkg,
				uiPackageVisibility: uiVisibility,
				version: "2.1.10",
			};
			await saveConfig(updatedCfg, root);
		});
	}

	// ── Done ──────────────────────────────────────────────────────────────────
	printSuccess({
		title: "Migration complete",
		commands: [
			{ cmd: `${pm} install`, comment: "reinstall to pick up any dep changes" },
			{ cmd: `${pm} nx run-many --target=build`, comment: "verify everything builds" },
		],
		tips: [
			{
				label: "Backup files created:",
				cmd: "find . -name '*.migration-backup' — delete them once verified",
			},
			{
				label: "New command available:",
				cmd: "nx-factory-cli add-lib --type utils  (now prompts for visibility)",
			},
		],
	});
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

async function analyseWorkspace(root: string): Promise<MigrationStatus> {
	const { default: fs } = await import("fs-extra");

	const cfg = await loadConfig();
	const hasTsConfigBase = await pathExists(path.join(root, "tsconfig.base.json"));

	// Find UI package
	let uiPackageDir: string | null = null;
	const packagesDir = path.join(root, "packages");
	if (await pathExists(packagesDir)) {
		const entries = await fs.readdir(packagesDir);
		for (const e of entries) {
			if (await pathExists(path.join(packagesDir, e, "components.json"))) {
				uiPackageDir = path.join(packagesDir, e);
				break;
			}
		}
		// Fallback to first package if no components.json found
		if (!uiPackageDir && entries.length > 0) {
			uiPackageDir = path.join(packagesDir, entries[0]);
		}
	}

	// Find packages with outdated tsconfigs (missing composite / still on bundler resolution)
	const packagesWithBadTsConfig: string[] = [];
	if (await pathExists(packagesDir)) {
		const entries = await fs.readdir(packagesDir);
		for (const e of entries) {
			const tsCfgPath = path.join(packagesDir, e, "tsconfig.json");
			if (!(await pathExists(tsCfgPath))) continue;
			try {
				const tsJson = await fs.readJson(tsCfgPath) as Record<string, unknown>;
				const co = (tsJson.compilerOptions ?? {}) as Record<string, unknown>;
				// Outdated if: no composite, or moduleResolution is bundler (should be NodeNext via extends)
				const isOutdated =
					!co.composite ||
					String(co.moduleResolution ?? "").toLowerCase() === "bundler" ||
					!tsJson.extends;
				if (isOutdated) packagesWithBadTsConfig.push(e);
			} catch { /* malformed — flag it */ packagesWithBadTsConfig.push(e); }
		}
	}

	// Find apps with outdated tsconfigs
	const appsWithBadTsConfig: string[] = [];
	const appsDir = path.join(root, "apps");
	if (await pathExists(appsDir)) {
		const entries = await fs.readdir(appsDir);
		for (const e of entries) {
			const tsCfgPath = path.join(appsDir, e, "tsconfig.json");
			if (!(await pathExists(tsCfgPath))) continue;
			try {
				const tsJson = await fs.readJson(tsCfgPath) as Record<string, unknown>;
				const co = (tsJson.compilerOptions ?? {}) as Record<string, unknown>;
				const paths = (co.paths ?? {}) as Record<string, unknown>;
				// Outdated if: doesn't extend base, or paths are missing the @scope/* mapping,
				// or still has packages/**/* in include
				const hasWrongIncludes = Array.isArray(tsJson.include) &&
					(tsJson.include as string[]).some((i) => i.includes("packages/**"));
				const missingExtends = !tsJson.extends ||
					!String(tsJson.extends).includes("tsconfig.base");
				const missingPaths = !Object.keys(paths).some((k) => k.startsWith("@") && k.endsWith("/*"));
				if (hasWrongIncludes || missingExtends || missingPaths) {
					appsWithBadTsConfig.push(e);
				}
			} catch { /* malformed — flag it */ appsWithBadTsConfig.push(e); }
		}
	}

	return {
		hasConfig: !!cfg,
		configVersion: cfg?.version ?? null,
		hasTsConfigBase,
		hasUiPackageVisibility: !!cfg?.uiPackageVisibility,
		uiPackageDir,
		appsWithBadTsConfig,
		packagesWithBadTsConfig,
	};
}

function isFullyMigrated(s: MigrationStatus): boolean {
	return (
		s.hasConfig &&
		s.hasTsConfigBase &&
		s.hasUiPackageVisibility &&
		s.appsWithBadTsConfig.length === 0 &&
		s.packagesWithBadTsConfig.length === 0
	);
}

function printAnalysis(s: MigrationStatus): void {
	const tick = c.green("✓");
	const cross = c.yellow("✗");

	console.log();
	console.log(`  ${s.hasConfig ? tick : cross}  nx-factory.config.json ${s.hasConfig ? c.dim(`(v${s.configVersion ?? "unknown"})`) : c.yellow("missing")}`);
	console.log(`  ${s.hasTsConfigBase ? tick : cross}  tsconfig.base.json ${s.hasTsConfigBase ? "" : c.yellow("missing — will create")}`);
	console.log(`  ${s.hasUiPackageVisibility ? tick : cross}  UI package visibility ${s.hasUiPackageVisibility ? "" : c.yellow("not set — will prompt")}`);

	if (s.packagesWithBadTsConfig.length > 0) {
		console.log(`  ${cross}  Packages needing tsconfig migration: ${c.yellow(s.packagesWithBadTsConfig.join(", "))}`);
	} else {
		console.log(`  ${tick}  All package tsconfigs are up to date`);
	}

	if (s.appsWithBadTsConfig.length > 0) {
		console.log(`  ${cross}  Apps needing tsconfig migration: ${c.yellow(s.appsWithBadTsConfig.join(", "))}`);
	} else {
		console.log(`  ${tick}  All app tsconfigs are up to date`);
	}
	console.log();
}

async function detectFrameworkFromAppDir(
	appDir: string,
): Promise<"nextjs" | "vite" | "remix" | "expo"> {
	const checks: Array<[string, "nextjs" | "vite" | "remix" | "expo"]> = [
		["next.config.ts", "nextjs"],
		["next.config.js", "nextjs"],
		["next.config.mjs", "nextjs"],
		["app/root.tsx", "remix"],
		["app/root.jsx", "remix"],
		["app.json", "expo"],
		["app.config.ts", "expo"],
		["vite.config.ts", "vite"],
		["vite.config.js", "vite"],
	];
	for (const [file, fw] of checks) {
		if (await pathExists(path.join(appDir, file))) return fw;
	}
	return "nextjs";
}

// ─── Backup helper ────────────────────────────────────────────────────────────

async function backupIfExists(filePath: string, dryRun?: boolean): Promise<void> {
	if (dryRun) return;
	if (!(await pathExists(filePath))) return;
	const { default: fs } = await import("fs-extra");
	await fs.copy(filePath, `${filePath}.migration-backup`, { overwrite: true });
}
