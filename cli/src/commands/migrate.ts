import inquirer from "inquirer";
import path from "path";
import {
	loadConfig,
	resolveScope,
	saveConfig,
	type NxShadcnConfig,
	type PackageVisibility,
} from "../config.js";
import { detectPackageManager, pmWorkspaceProtocol } from "../exec.js";
import { pathExists, writeJson } from "../files.js";
import {
	MonorepoRootNotFoundError,
	requireMonorepoRoot,
} from "../resolve-root.js";
import {
	appTsConfig,
	packageTsConfig,
	rootTsConfigBase,
	rootTsConfigSolution,
	typescriptPackageJson,
	typescriptPresets,
} from "../tsconfigs.js";
import {
	c,
	createStepRunner,
	printError,
	printSection,
	printSuccess,
	q,
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
	hasToolingTypescriptPackage: boolean;
	hasToolingTypescriptBaseExtendsRoot: boolean;
	hasToolingTypescriptTsconfigExportAlias: boolean;
	hasLegacyTypescriptPackage: boolean;
	hasRootToolingWorkspaceEntry: boolean;
	hasUiPackageVisibility: boolean;
	uiPackageDir: string | null;
	appsWithBadTsConfig: string[];
	packagesWithBadTsConfig: string[];
	projectsMissingTypescriptToolingDep: string[];
	publicPackagesEligibleForInternalization: string[];
	packagesWithExportsToRemove: string[];
	/** Internal source packages whose .ts files have .js extensions on relative imports */
	internalPackagesWithJsExtensions: string[];
	/** Count of *.migration-backup files in the workspace */
	backupFileCount: number;
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
					{
						label: "Run from inside an nx-factory-cli workspace:",
						cmd: "cd <workspace-root>",
					},
					{ label: "Or start fresh:", cmd: "nx-factory-cli init" },
				],
			});
		} else {
			printError({
				title: "Unexpected error",
				detail: String(err),
				recovery: [
					{ label: "Run from workspace root:", cmd: "cd <workspace-root>" },
				],
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

	const defaultAnswers = {
		migrateTypescriptTooling: true,
		packagesToMakeInternal: [] as string[],
		uiVisibility: "internal" as PackageVisibility,
		removeJsExtensions: false,
		cleanupBackups: false,
	};

	let answers = { ...defaultAnswers };

	if (!options.yes) {
		const proceedPrompt = await inquirer.prompt([
			{
				type: "confirm",
				name: "proceed",
				message: q(
					"Apply all migrations?",
					"a backup of each changed file will be written as <file>.migration-backup",
				),
				default: true,
			},
		]);

		if (!proceedPrompt.proceed) {
			console.log(c.dim("\n  Migration cancelled.\n"));
			return;
		}

		answers = {
			...defaultAnswers,
			...((await inquirer.prompt([
				{
					type: "confirm",
					name: "migrateTypescriptTooling",
					message: q(
						"Migrate TypeScript tooling package?",
						"move packages/typescript to tooling/typescript and refresh tsconfig presets",
					),
					default: true,
					when:
						!status.hasToolingTypescriptPackage ||
						status.hasLegacyTypescriptPackage ||
						!status.hasToolingTypescriptBaseExtendsRoot ||
						!status.hasToolingTypescriptTsconfigExportAlias,
				},
				{
					type: "checkbox",
					name: "packagesToMakeInternal",
					message: q(
						"Select packages to make internal",
						"selected packages will get private:true in package.json",
					),
					choices: status.publicPackagesEligibleForInternalization.map(
						(pkgName) => ({ name: pkgName, value: pkgName }),
					),
					when: status.publicPackagesEligibleForInternalization.length > 0,
				},
				{
					type: "select",
					name: "uiVisibility",
					message: q(
						"UI package visibility",
						"internal = workspace only · public = published to npm",
					),
					choices: [
						{
							name: "internal  — private: true, workspace only",
							value: "internal",
						},
						{ name: "public    — will be published to npm", value: "public" },
					],
					default: "internal",
					when: !status.hasUiPackageVisibility,
				},
				{
					type: "confirm",
					name: "removeJsExtensions",
					message: q(
						"Remove .js extensions from internal package imports?",
						`found ${status.internalPackagesWithJsExtensions.length} package(s) with .js extensions — safe to remove for Bundler resolution`,
					),
					default: status.internalPackagesWithJsExtensions.length > 0,
					when: status.internalPackagesWithJsExtensions.length > 0,
				},
				{
					type: "confirm",
					name: "cleanupBackups",
					message: q(
						`Delete ${status.backupFileCount} existing .migration-backup file(s)?`,
						"these are from a previous migration run",
					),
					default: false,
					when: status.backupFileCount > 0,
				},
			])) as Partial<typeof defaultAnswers>),
		};
	}

	const uiVisibility = answers.uiVisibility;
	const shouldMigrateTypescriptTooling =
		answers.migrateTypescriptTooling &&
		(!status.hasToolingTypescriptPackage ||
			status.hasLegacyTypescriptPackage ||
			!status.hasToolingTypescriptBaseExtendsRoot ||
			!status.hasToolingTypescriptTsconfigExportAlias);
	const packagesToMakeInternal = answers.packagesToMakeInternal;
	const removeJsExtensions = answers.removeJsExtensions;
	const cleanupBackupsNow = options.yes ? false : answers.cleanupBackups;

	// ── Count steps dynamically ───────────────────────────────────────────────
	let totalSteps = 0;
	if (!status.hasTsConfigBase) totalSteps++;
	if (shouldMigrateTypescriptTooling) totalSteps++;
	if (!status.hasRootToolingWorkspaceEntry) totalSteps++;
	if (status.projectsMissingTypescriptToolingDep.length > 0) totalSteps++;
	if (packagesToMakeInternal.length > 0) totalSteps++;
	if (status.packagesWithExportsToRemove.length > 0) totalSteps++;
	if (!status.hasUiPackageVisibility && status.uiPackageDir) totalSteps++;
	if (status.packagesWithBadTsConfig.length > 0) totalSteps++;
	if (status.appsWithBadTsConfig.length > 0) totalSteps++;
	if (!status.hasConfig || !status.hasUiPackageVisibility) totalSteps++;
	totalSteps += 1; // always update solution tsconfig.json
	if (removeJsExtensions && status.internalPackagesWithJsExtensions.length > 0)
		totalSteps++;
	if (cleanupBackupsNow && status.backupFileCount > 0) totalSteps++;
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

	// ── Step 1b: Migrate tooling/typescript package ─────────────────────────
	if (shouldMigrateTypescriptTooling) {
		await step("Migrate tooling/typescript workspace package", async () => {
			await migrateTypescriptToolingPackage(root, scope);
		});
	}

	// ── Step 1c: Ensure tooling/* is included in root workspaces ────────────
	if (!status.hasRootToolingWorkspaceEntry) {
		await step('Add "tooling/*" to root package.json workspaces', async () => {
			await ensureRootToolingWorkspaceEntry(root);
		});
	}

	// ── Step 1d: Ensure @scope/typescript is wired into project package.json ─
	if (status.projectsMissingTypescriptToolingDep.length > 0) {
		await step(
			`Add TypeScript tooling dependency to ${status.projectsMissingTypescriptToolingDep.length} package.json file(s)`,
			async () => {
				await ensureTypescriptToolingDeps(
					root,
					scope,
					pm,
					status.projectsMissingTypescriptToolingDep,
					options.dryRun,
				);
			},
		);
	}

	// ── Step 1e: Make selected public packages internal ──────────────────────
	if (packagesToMakeInternal.length > 0) {
		await step(
			`Make ${packagesToMakeInternal.length} package(s) internal`,
			async () => {
				await makePackagesInternal(
					root,
					packagesToMakeInternal,
					options.dryRun,
				);
			},
		);
	}

	// ── Step 1f: Remove exports from non-UI package.json files ───────────────
	if (status.packagesWithExportsToRemove.length > 0) {
		await step(
			`Remove package exports from ${status.packagesWithExportsToRemove.length} non-UI package(s)`,
			async () => {
				await removeExportsFromPackages(
					root,
					status.packagesWithExportsToRemove,
					options.dryRun,
				);
			},
		);
	}

	// ── Step 2: Migrate UI package tsconfig + package.json ──────────────────
	if (!status.hasUiPackageVisibility && status.uiPackageDir) {
		const uiPkgName = path.basename(status.uiPackageDir);
		await step(
			`Migrate packages/${uiPkgName} (tsconfig + package.json)`,
			async () => {
				const { default: fs } = await import("fs-extra");

				// tsconfig.json
				const tsCfgPath = path.join(status.uiPackageDir ?? "", "tsconfig.json");
				await backupIfExists(tsCfgPath, options.dryRun);
				await writeJson(
					tsCfgPath,
					packageTsConfig({
						scope,
						pkgName: uiPkgName,
						visibility: uiVisibility,
						react: true,
					}),
				);

				// package.json — add exports + publishConfig if public, ensure private:true if internal
				const pkgPath = path.join(status.uiPackageDir ?? "", "package.json");
				if (await pathExists(pkgPath)) {
					await backupIfExists(pkgPath, options.dryRun);
					const pkg = (await fs.readJson(pkgPath)) as Record<string, unknown>;

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
			},
		);
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
						const existing = (await fs.readJson(tsCfgPath)) as Record<
							string,
							unknown
						>;
						const co = (existing.compilerOptions ?? {}) as Record<
							string,
							unknown
						>;
						isReact = !!co.jsx;
					} catch {
						/* no tsconfig — use safe default */
					}

					// Detect visibility from package.json
					let visibility: PackageVisibility = "internal";
					try {
						const { default: fs } = await import("fs-extra");
						const pkg = (await fs.readJson(
							path.join(pkgDir, "package.json"),
						)) as Record<string, unknown>;
						if (!pkg.private) visibility = "public";
					} catch {
						/* keep internal */
					}

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
					const generated = appTsConfig({
						scope,
						framework: fw,
						hasSrcDir,
						typescriptPkgExists: true,
					});

					// Merge — keep framework-generated keys, override extends + paths + include
					const existing = (await fs.readJson(tsCfgPath)) as Record<
						string,
						unknown
					>;
					const merged = {
						...existing,
						...generated,
						compilerOptions: {
							...((existing.compilerOptions as object) ?? {}),
							...(generated as { compilerOptions: object }).compilerOptions,
						},
					};
					await fs.writeJson(tsCfgPath, merged, { spaces: 2 });
				}
			},
		);
	}

	// ── Step 4b: Update/create root solution tsconfig.json ────────────────────
	await step("Update root tsconfig.json solution file", async () => {
		const { default: fs } = await import("fs-extra");
		const pkgNames: string[] = [];
		const appNames: string[] = [];
		try {
			const pkgDir = path.join(root, "packages");
			if (await pathExists(pkgDir))
				pkgNames.push(...(await fs.readdir(pkgDir)));
		} catch {
			/* ok */
		}
		try {
			const appsDir = path.join(root, "apps");
			if (await pathExists(appsDir))
				appNames.push(...(await fs.readdir(appsDir)));
		} catch {
			/* ok */
		}
		await writeJson(
			path.join(root, "tsconfig.json"),
			rootTsConfigSolution(pkgNames, appNames),
		);
	});

	// ── Step 5: Update nx-factory.config.json ─────────────────────────────────
	if (!status.hasConfig || !status.hasUiPackageVisibility) {
		await step("Update nx-factory.config.json", async () => {
			const uiPkg =
				cfg?.uiPackage ??
				(status.uiPackageDir ? path.basename(status.uiPackageDir) : "ui");
			const updatedCfg: NxShadcnConfig = {
				workspaceName: cfg?.workspaceName ?? path.basename(root),
				scope,
				pkgManager: pm as NxShadcnConfig["pkgManager"],
				uiPackage: uiPkg,
				uiPackageVisibility: uiVisibility,
				version: "2.1.10",
			};
			await saveConfig(updatedCfg, root);
		});
	}

	// ── Step 6: Strip .js extensions from internal package imports ───────────
	if (
		removeJsExtensions &&
		status.internalPackagesWithJsExtensions.length > 0
	) {
		await step(
			`Remove .js extensions from ${status.internalPackagesWithJsExtensions.length} internal package(s)`,
			async () => {
				for (const pkgName of status.internalPackagesWithJsExtensions) {
					const pkgDir = path.join(root, "packages", pkgName);
					await stripJsExtensionsFromDir(pkgDir, options.dryRun);
				}
			},
		);
	}

	// ── Step 7: Clean up existing .migration-backup files ────────────────────
	if (cleanupBackupsNow && status.backupFileCount > 0) {
		await step(
			`Delete ${status.backupFileCount} .migration-backup file(s)`,
			async () => {
				await cleanupMigrationBackups(root, options.dryRun);
			},
		);
	}

	// ── Done ──────────────────────────────────────────────────────────────────
	const backupsRemaining = cleanupBackupsNow ? 0 : status.backupFileCount;
	printSuccess({
		title: "Migration complete",
		commands: [
			{ cmd: `${pm} install`, comment: "reinstall to pick up any dep changes" },
			{
				cmd: `${pm} nx run-many --target=build`,
				comment: "verify everything builds",
			},
		],
		tips: [
			...(backupsRemaining > 0
				? [
						{
							label: `${backupsRemaining} backup file(s) remain:`,
							cmd: "nx-factory-cli migrate  (run again to clean them up)",
						},
					]
				: []),
			{
				label: "Internal packages now use Bundler resolution:",
				cmd: "No .js extensions needed in source imports — your bundler handles resolution",
			},
		],
	});
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

async function analyseWorkspace(root: string): Promise<MigrationStatus> {
	const { default: fs } = await import("fs-extra");

	const cfg = await loadConfig();
	const scope = resolveScope(cfg);
	const hasTsConfigBase = await pathExists(
		path.join(root, "tsconfig.base.json"),
	);
	const hasToolingTypescriptPackage = await pathExists(
		path.join(root, "tooling", "typescript", "tsconfig.internal.json"),
	);
	const hasToolingTypescriptBaseExtendsRoot =
		await toolingTypescriptBaseExtendsRoot(root);
	const hasToolingTypescriptTsconfigExportAlias =
		await toolingTypescriptPackageJsonHasTsconfigAlias(root);
	const hasLegacyTypescriptPackage = await pathExists(
		path.join(root, "packages", "typescript", "tsconfig.internal.json"),
	);
	const hasRootToolingWorkspaceEntry = await hasToolingWorkspaceEntry(root);

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
			if (e === "typescript") continue;
			const tsCfgPath = path.join(packagesDir, e, "tsconfig.json");
			if (!(await pathExists(tsCfgPath))) continue;
			try {
				const tsJson = (await fs.readJson(tsCfgPath)) as Record<
					string,
					unknown
				>;

				let visibility: PackageVisibility = "internal";
				try {
					const pkg = (await fs.readJson(
						path.join(packagesDir, e, "package.json"),
					)) as Record<string, unknown>;
					if (!pkg.private) visibility = "public";
				} catch {
					/* keep internal by default */
				}

				const expectedExtends =
					visibility === "internal"
						? `@${scope}/typescript/tsconfig.internal.json`
						: `@${scope}/typescript/tsconfig.package.json`;
				const extendsValue = String(tsJson.extends ?? "");

				// Outdated if package still extends workspace base directly or doesn't match
				// the scoped tooling preset required by visibility.
				const isOutdated =
					!extendsValue ||
					extendsValue.includes("tsconfig.base.json") ||
					extendsValue !== expectedExtends;
				if (isOutdated) packagesWithBadTsConfig.push(e);
			} catch {
				/* malformed — flag it */ packagesWithBadTsConfig.push(e);
			}
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
				const tsJson = (await fs.readJson(tsCfgPath)) as Record<
					string,
					unknown
				>;
				const co = (tsJson.compilerOptions ?? {}) as Record<string, unknown>;
				const paths = (co.paths ?? {}) as Record<string, unknown>;
				const framework = await detectFrameworkFromAppDir(
					path.join(appsDir, e),
				);
				const expectedExtends = `@${scope}/typescript/${frameworkTsPresetFile(framework)}`;
				const extendsValue = String(tsJson.extends ?? "");

				// Outdated if still on root tsconfig.base, not using expected scoped preset,
				// or still has legacy include patterns.
				const hasWrongIncludes =
					Array.isArray(tsJson.include) &&
					(tsJson.include as string[]).some((i) => i.includes("packages/**"));
				const hasLegacyBaseExtends =
					extendsValue.includes("tsconfig.base.json");
				const missingOrWrongExtends =
					!extendsValue ||
					hasLegacyBaseExtends ||
					extendsValue !== expectedExtends;
				const missingPaths = !Object.keys(paths).some(
					(k) => k.startsWith("@") && k.endsWith("/*"),
				);
				if (hasWrongIncludes || missingOrWrongExtends || missingPaths) {
					appsWithBadTsConfig.push(e);
				}
			} catch {
				/* malformed — flag it */ appsWithBadTsConfig.push(e);
			}
		}
	}

	// Find internal packages with .js extensions on relative imports
	const internalPackagesWithJsExtensions: string[] = [];
	if (await pathExists(packagesDir)) {
		const entries = await fs.readdir(packagesDir);
		for (const e of entries) {
			if (e === "typescript") continue; // skip the typescript config package itself
			const pkgDir = path.join(packagesDir, e);
			// Only check internal packages (private: true)
			try {
				const pkg = (await fs.readJson(
					path.join(pkgDir, "package.json"),
				)) as Record<string, unknown>;
				if (!pkg.private) continue;
			} catch {
				continue;
			}
			if (await dirHasJsExtensionImports(pkgDir)) {
				internalPackagesWithJsExtensions.push(e);
			}
		}
	}

	// Count existing backup files
	const backupFileCount = await countBackupFiles(root);
	const projectsMissingTypescriptToolingDep =
		await listProjectsMissingToolingTypescriptDependency(root, scope);
	const publicPackagesEligibleForInternalization =
		await listPublicPackagesEligibleForInternalization(root, uiPackageDir);
	const packagesWithExportsToRemove = await listPackagesWithExportsToRemove(
		root,
		cfg?.uiPackage,
		uiPackageDir,
	);

	return {
		hasConfig: !!cfg,
		configVersion: cfg?.version ?? null,
		hasTsConfigBase,
		hasToolingTypescriptPackage,
		hasToolingTypescriptBaseExtendsRoot,
		hasToolingTypescriptTsconfigExportAlias,
		hasLegacyTypescriptPackage,
		hasRootToolingWorkspaceEntry,
		hasUiPackageVisibility: !!cfg?.uiPackageVisibility,
		uiPackageDir,
		appsWithBadTsConfig,
		packagesWithBadTsConfig,
		projectsMissingTypescriptToolingDep,
		publicPackagesEligibleForInternalization,
		packagesWithExportsToRemove,
		internalPackagesWithJsExtensions,
		backupFileCount,
	};
}

function isFullyMigrated(s: MigrationStatus): boolean {
	return (
		s.hasConfig &&
		s.hasTsConfigBase &&
		s.hasToolingTypescriptPackage &&
		s.hasToolingTypescriptBaseExtendsRoot &&
		s.hasToolingTypescriptTsconfigExportAlias &&
		!s.hasLegacyTypescriptPackage &&
		s.hasRootToolingWorkspaceEntry &&
		s.hasUiPackageVisibility &&
		s.publicPackagesEligibleForInternalization.length === 0 &&
		s.packagesWithExportsToRemove.length === 0 &&
		s.appsWithBadTsConfig.length === 0 &&
		s.packagesWithBadTsConfig.length === 0 &&
		s.projectsMissingTypescriptToolingDep.length === 0 &&
		s.internalPackagesWithJsExtensions.length === 0 &&
		s.backupFileCount === 0
	);
}

function printAnalysis(s: MigrationStatus): void {
	const tick = c.green("✓");
	const cross = c.yellow("✗");

	console.log();
	console.log(
		`  ${s.hasConfig ? tick : cross}  nx-factory.config.json ${s.hasConfig ? c.dim(`(v${s.configVersion ?? "unknown"})`) : c.yellow("missing")}`,
	);
	console.log(
		`  ${s.hasTsConfigBase ? tick : cross}  tsconfig.base.json ${s.hasTsConfigBase ? "" : c.yellow("missing — will create")}`,
	);
	console.log(
		`  ${s.hasToolingTypescriptPackage ? tick : cross}  tooling/typescript presets ${s.hasToolingTypescriptPackage ? "" : c.yellow("missing — will migrate")}`,
	);
	if (s.hasToolingTypescriptPackage) {
		console.log(
			`  ${s.hasToolingTypescriptBaseExtendsRoot ? tick : cross}  tooling/typescript/tsconfig.base.json extends ../../tsconfig.base.json ${s.hasToolingTypescriptBaseExtendsRoot ? "" : c.yellow("missing — will refresh presets")}`,
		);
		console.log(
			`  ${s.hasToolingTypescriptTsconfigExportAlias ? tick : cross}  tooling/typescript/package.json exports ./tsconfig.json ${s.hasToolingTypescriptTsconfigExportAlias ? "" : c.yellow("missing — will refresh package.json")}`,
		);
	}
	if (s.hasLegacyTypescriptPackage) {
		console.log(
			`  ${cross}  legacy packages/typescript detected ${c.yellow("will migrate to tooling/typescript")}`,
		);
	}
	console.log(
		`  ${s.hasRootToolingWorkspaceEntry ? tick : cross}  root package.json workspaces include tooling/* ${s.hasRootToolingWorkspaceEntry ? "" : c.yellow("missing — will add")}`,
	);
	if (s.projectsMissingTypescriptToolingDep.length > 0) {
		console.log(
			`  ${cross}  package.json files missing @scope/typescript dep: ${c.yellow(s.projectsMissingTypescriptToolingDep.join(", "))}`,
		);
	} else {
		console.log(
			`  ${tick}  @scope/typescript dependency is present where needed`,
		);
	}
	if (s.publicPackagesEligibleForInternalization.length > 0) {
		console.log(
			`  ${c.dim("○")}  Public packages available to make internal: ${c.yellow(s.publicPackagesEligibleForInternalization.join(", "))}`,
		);
	}
	if (s.packagesWithExportsToRemove.length > 0) {
		console.log(
			`  ${cross}  Non-UI packages with exports field: ${c.yellow(s.packagesWithExportsToRemove.join(", "))} ${c.dim("(will remove exports)")}`,
		);
	} else {
		console.log(`  ${tick}  Non-UI package exports are already cleaned up`);
	}
	console.log(
		`  ${s.hasUiPackageVisibility ? tick : cross}  UI package visibility ${s.hasUiPackageVisibility ? "" : c.yellow("not set — will prompt")}`,
	);

	if (s.packagesWithBadTsConfig.length > 0) {
		console.log(
			`  ${cross}  Packages needing tsconfig migration: ${c.yellow(s.packagesWithBadTsConfig.join(", "))}`,
		);
	} else {
		console.log(`  ${tick}  All package tsconfigs are up to date`);
	}

	if (s.appsWithBadTsConfig.length > 0) {
		console.log(
			`  ${cross}  Apps needing tsconfig migration: ${c.yellow(s.appsWithBadTsConfig.join(", "))}`,
		);
	} else {
		console.log(`  ${tick}  All app tsconfigs are up to date`);
	}
	if (s.internalPackagesWithJsExtensions.length > 0) {
		console.log(
			`  ${cross}  Internal packages with .js extensions: ${c.yellow(s.internalPackagesWithJsExtensions.join(", "))} ${c.dim("(safe to remove)")}`,
		);
	} else {
		console.log(`  ${tick}  No .js extension issues in internal packages`);
	}
	if (s.backupFileCount > 0) {
		console.log(
			`  ${c.dim("○")}  ${s.backupFileCount} .migration-backup file(s) exist from a previous run`,
		);
	}
	console.log();
}

async function migrateTypescriptToolingPackage(
	root: string,
	scope: string,
): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const legacyDir = path.join(root, "packages", "typescript");
	const toolingDir = path.join(root, "tooling", "typescript");
	const legacyExists = await pathExists(legacyDir);
	const toolingExists = await pathExists(toolingDir);

	if (legacyExists && !toolingExists) {
		await fs.ensureDir(path.join(root, "tooling"));
		await fs.move(legacyDir, toolingDir, { overwrite: false });
	}

	if (legacyExists && toolingExists) {
		const backupDir = path.join(
			root,
			".migration-backups",
			"packages-typescript",
		);
		await fs.ensureDir(path.dirname(backupDir));
		await fs.copy(legacyDir, backupDir, { overwrite: true });
		await fs.remove(legacyDir);
	}

	await fs.ensureDir(toolingDir);
	await writeJson(
		path.join(toolingDir, "package.json"),
		typescriptPackageJson(scope),
	);
	const presets = typescriptPresets();
	for (const [filename, content] of Object.entries(presets)) {
		await writeJson(path.join(toolingDir, filename), content);
	}
}

async function hasToolingWorkspaceEntry(root: string): Promise<boolean> {
	const { default: fs } = await import("fs-extra");
	const pkgPath = path.join(root, "package.json");
	if (!(await pathExists(pkgPath))) return false;

	try {
		const pkgJson = (await fs.readJson(pkgPath)) as {
			workspaces?: string[] | { packages?: string[] };
		};
		if (Array.isArray(pkgJson.workspaces)) {
			return pkgJson.workspaces.includes("tooling/*");
		}
		if (pkgJson.workspaces && Array.isArray(pkgJson.workspaces.packages)) {
			return pkgJson.workspaces.packages.includes("tooling/*");
		}
		return false;
	} catch {
		return false;
	}
}

async function toolingTypescriptBaseExtendsRoot(
	root: string,
): Promise<boolean> {
	const { default: fs } = await import("fs-extra");
	const tsBasePath = path.join(
		root,
		"tooling",
		"typescript",
		"tsconfig.base.json",
	);
	if (!(await pathExists(tsBasePath))) return false;

	try {
		const tsBase = (await fs.readJson(tsBasePath)) as { extends?: unknown };
		return tsBase.extends === "../../tsconfig.base.json";
	} catch {
		return false;
	}
}

async function toolingTypescriptPackageJsonHasTsconfigAlias(
	root: string,
): Promise<boolean> {
	const { default: fs } = await import("fs-extra");
	const pkgPath = path.join(root, "tooling", "typescript", "package.json");
	if (!(await pathExists(pkgPath))) return false;

	try {
		const pkgJson = (await fs.readJson(pkgPath)) as {
			exports?: Record<string, unknown>;
		};
		return pkgJson.exports?.["./tsconfig.json"] === "./tsconfig.base.json";
	} catch {
		return false;
	}
}

async function ensureRootToolingWorkspaceEntry(root: string): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const pkgPath = path.join(root, "package.json");
	if (!(await pathExists(pkgPath))) return;

	const pkgJson = (await fs.readJson(pkgPath)) as {
		workspaces?: string[] | { packages?: string[] };
	};
	if (Array.isArray(pkgJson.workspaces)) {
		pkgJson.workspaces = Array.from(
			new Set([...pkgJson.workspaces, "tooling/*"]),
		);
	} else if (pkgJson.workspaces && Array.isArray(pkgJson.workspaces.packages)) {
		pkgJson.workspaces.packages = Array.from(
			new Set([...pkgJson.workspaces.packages, "tooling/*"]),
		);
	} else {
		pkgJson.workspaces = ["packages/*", "apps/*", "tooling/*"];
	}

	await fs.writeJson(pkgPath, pkgJson, { spaces: 2 });
}

async function listProjectsMissingToolingTypescriptDependency(
	root: string,
	scope: string,
): Promise<string[]> {
	const { default: fs } = await import("fs-extra");
	const projectDirs = ["packages", "apps"];
	const tsPkgName = `@${scope}/typescript`;
	const missing: string[] = [];

	for (const parent of projectDirs) {
		const parentDir = path.join(root, parent);
		if (!(await pathExists(parentDir))) continue;
		const entries = await fs.readdir(parentDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (parent === "packages" && entry.name === "typescript") continue;
			const projectDir = path.join(parentDir, entry.name);
			const tsConfigPath = path.join(projectDir, "tsconfig.json");
			const pkgJsonPath = path.join(projectDir, "package.json");
			if (
				!(await pathExists(tsConfigPath)) ||
				!(await pathExists(pkgJsonPath))
			) {
				continue;
			}

			try {
				const pkgJson = (await fs.readJson(pkgJsonPath)) as {
					dependencies?: Record<string, string>;
					devDependencies?: Record<string, string>;
					peerDependencies?: Record<string, string>;
					optionalDependencies?: Record<string, string>;
				};

				const hasDep =
					!!pkgJson.dependencies?.[tsPkgName] ||
					!!pkgJson.devDependencies?.[tsPkgName] ||
					!!pkgJson.peerDependencies?.[tsPkgName] ||
					!!pkgJson.optionalDependencies?.[tsPkgName];

				// Any app/package project with tsconfig+package.json participates in migration
				// and should have the shared tooling preset package as a dependency.
				if (!hasDep) missing.push(`${parent}/${entry.name}`);
			} catch {
				continue;
			}
		}
	}

	return missing.sort();
}

async function ensureTypescriptToolingDeps(
	root: string,
	scope: string,
	pm: string,
	projectPaths: string[],
	dryRun?: boolean,
): Promise<void> {
	const { default: fs } = await import("fs-extra");
	const tsPkgName = `@${scope}/typescript`;
	const protocol = pmWorkspaceProtocol(pm);

	for (const projectPath of projectPaths) {
		const pkgJsonPath = path.join(root, projectPath, "package.json");
		if (!(await pathExists(pkgJsonPath))) continue;
		await backupIfExists(pkgJsonPath, dryRun);

		const pkgJson = (await fs.readJson(pkgJsonPath)) as {
			devDependencies?: Record<string, string>;
		};
		pkgJson.devDependencies = {
			...(pkgJson.devDependencies ?? {}),
			[tsPkgName]: protocol,
		};
		await fs.writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
	}
}

async function listPublicPackagesEligibleForInternalization(
	root: string,
	uiPackageDir: string | null,
): Promise<string[]> {
	const { default: fs } = await import("fs-extra");
	const packagesDir = path.join(root, "packages");
	if (!(await pathExists(packagesDir))) return [];

	const uiPkgName = uiPackageDir ? path.basename(uiPackageDir) : null;
	const entries = await fs.readdir(packagesDir, { withFileTypes: true });
	const publicPackages: string[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name === "typescript") continue;
		if (uiPkgName && entry.name === uiPkgName) continue;

		const pkgPath = path.join(packagesDir, entry.name, "package.json");
		if (!(await pathExists(pkgPath))) continue;

		try {
			const pkgJson = (await fs.readJson(pkgPath)) as {
				private?: unknown;
			};
			if (!pkgJson.private) {
				publicPackages.push(entry.name);
			}
		} catch {
			continue;
		}
	}

	return publicPackages.sort();
}

async function listPackagesWithExportsToRemove(
	root: string,
	configuredUiPackage: string | undefined,
	uiPackageDir: string | null,
): Promise<string[]> {
	const { default: fs } = await import("fs-extra");
	const packagesDir = path.join(root, "packages");
	if (!(await pathExists(packagesDir))) return [];

	const preserved = new Set<string>([
		...(configuredUiPackage ? [configuredUiPackage] : []),
		...(uiPackageDir ? [path.basename(uiPackageDir)] : []),
		"design-system",
	]);

	const entries = await fs.readdir(packagesDir, { withFileTypes: true });
	const withExports: string[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name === "typescript") continue;
		if (preserved.has(entry.name)) continue;

		const pkgPath = path.join(packagesDir, entry.name, "package.json");
		if (!(await pathExists(pkgPath))) continue;

		try {
			const pkgJson = (await fs.readJson(pkgPath)) as {
				exports?: unknown;
			};
			if (pkgJson.exports !== undefined) {
				withExports.push(entry.name);
			}
		} catch {
			continue;
		}
	}

	return withExports.sort();
}

async function makePackagesInternal(
	root: string,
	packageNames: string[],
	dryRun?: boolean,
): Promise<void> {
	const { default: fs } = await import("fs-extra");

	for (const pkgName of packageNames) {
		const pkgPath = path.join(root, "packages", pkgName, "package.json");
		if (!(await pathExists(pkgPath))) continue;
		await backupIfExists(pkgPath, dryRun);

		const pkgJson = (await fs.readJson(pkgPath)) as Record<string, unknown>;
		pkgJson.private = true;
		delete pkgJson.publishConfig;
		await fs.writeJson(pkgPath, pkgJson, { spaces: 2 });
	}
}

async function removeExportsFromPackages(
	root: string,
	packageNames: string[],
	dryRun?: boolean,
): Promise<void> {
	const { default: fs } = await import("fs-extra");

	for (const pkgName of packageNames) {
		const pkgPath = path.join(root, "packages", pkgName, "package.json");
		if (!(await pathExists(pkgPath))) continue;
		await backupIfExists(pkgPath, dryRun);

		const pkgJson = (await fs.readJson(pkgPath)) as Record<string, unknown>;
		if (pkgJson.exports === undefined) continue;
		delete pkgJson.exports;
		await fs.writeJson(pkgPath, pkgJson, { spaces: 2 });
	}
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

function frameworkTsPresetFile(
	framework: "nextjs" | "vite" | "remix" | "expo",
): string {
	switch (framework) {
		case "nextjs":
			return "tsconfig.nextjs.json";
		case "vite":
			return "tsconfig.vite.json";
		case "remix":
			return "tsconfig.remix.json";
		case "expo":
			return "tsconfig.expo.json";
	}
}

// ─── Backup helper ────────────────────────────────────────────────────────────

async function backupIfExists(
	filePath: string,
	dryRun?: boolean,
): Promise<void> {
	if (dryRun) return;
	if (!(await pathExists(filePath))) return;
	const { default: fs } = await import("fs-extra");
	await fs.copy(filePath, `${filePath}.migration-backup`, { overwrite: true });
}

// ─── .js extension helpers ────────────────────────────────────────────────────

/**
 * Checks if any .ts file in a directory has relative imports ending with .js
 * (e.g. `from "./utils.js"` instead of `from "./utils.js"`).
 */
async function dirHasJsExtensionImports(dir: string): Promise<boolean> {
	const { default: fs } = await import("fs-extra");
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (await dirHasJsExtensionImports(full)) return true;
		} else if (
			entry.isFile() &&
			(entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
		) {
			const content = await fs.readFile(full, "utf-8");
			// Match: from "./something.js" or from "../something.js"
			if (/from\s+["'](\.\.?\/[^"']+)\.js["']/.test(content)) return true;
		}
	}
	return false;
}

/**
 * Recursively removes .js extensions from relative imports in all .ts/.tsx
 * files within a directory. Only touches imports that start with ./ or ../
 *
 * Before: import { fn } from "./utils.js";
 * After:  import { fn } from "./utils.js";
 *
 * Does NOT touch:
 *   - Package imports (e.g. "react", "@scope/pkg")
 *   - Non-.js extensions (.json, .css, .svg, etc.)
 */
async function stripJsExtensionsFromDir(
	dir: string,
	dryRun?: boolean,
): Promise<number> {
	const { default: fs } = await import("fs-extra");
	const JS_IMPORT_RE = /(from\s+["'])(\.\.?\/[^"']+)\.js(["'])/g;
	const REEXPORT_RE = /(export\s+.*?\s+from\s+["'])(\.\.?\/[^"']+)\.js(["'])/g;
	const DYNAMIC_RE = /(import\s*\(\s*["'])(\.\.?\/[^"']+)\.js(["']\s*\))/g;

	let totalChanged = 0;

	async function processDir(currentDir: string): Promise<void> {
		const entries = await fs.readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			const full = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await processDir(full);
			} else if (
				entry.isFile() &&
				(entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
			) {
				const original = await fs.readFile(full, "utf-8");
				const modified = original
					.replace(JS_IMPORT_RE, "$1$2$3")
					.replace(REEXPORT_RE, "$1$2$3")
					.replace(DYNAMIC_RE, "$1$2$3");

				if (modified !== original) {
					totalChanged++;
					if (!dryRun) {
						// Back up before modifying
						await fs.copy(full, `${full}.migration-backup`, {
							overwrite: true,
						});
						await fs.writeFile(full, modified, "utf-8");
					}
				}
			}
		}
	}

	await processDir(dir);
	return totalChanged;
}

// ─── Backup cleanup helpers ───────────────────────────────────────────────────

/**
 * Counts all *.migration-backup files under the workspace root.
 */
async function countBackupFiles(root: string): Promise<number> {
	const { default: fs } = await import("fs-extra");
	let count = 0;

	async function walk(dir: string): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name === ".git") continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".migration-backup")) {
				count++;
			}
		}
	}

	await walk(root);
	return count;
}

/**
 * Deletes all *.migration-backup files under the workspace root.
 * Call this once you've verified the migration is correct.
 */
export async function cleanupMigrationBackups(
	root: string,
	dryRun?: boolean,
): Promise<number> {
	const { default: fs } = await import("fs-extra");
	let deleted = 0;

	async function walk(dir: string): Promise<void> {
		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.name === "node_modules" || entry.name === ".git") continue;
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					try {
						await walk(full);
					} catch {
						// Skip inaccessible directories (permission errors, broken symlinks, etc.)
						continue;
					}
				} else if (entry.isFile() && entry.name.endsWith(".migration-backup")) {
					try {
						deleted++;
						if (!dryRun) await fs.remove(full);
					} catch {
						// Skip files that can't be deleted (permission errors, locked files, etc.)
						deleted--; // Decrement since we couldn't actually delete it
						continue;
					}
				}
			}
		} catch {
			// Skip directories that can't be read (permission errors, etc.)
			return;
		}
	}

	await walk(root);
	return deleted;
}
