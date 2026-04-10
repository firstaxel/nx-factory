import path from "path";
import { pathExists, writeFile } from "../files.js";
import { loadConfig, resolveScope, scopedPackageName } from "../config.js";
import { c, printSuccess, printError, printWarn } from "../ui.js";

interface Check {
	name: string;
	status: "pass" | "warn" | "fail" | "fix";
	detail: string;
}

export async function doctorCommand(): Promise<void> {
	const cfg = await loadConfig();
	const scope = resolveScope(cfg);

	console.log(`\n  ${c.dim("─".repeat(44))}`);
	console.log(
		`  ${c.whiteBold("nx-factory-cli doctor")}  ${c.dim("workspace health check")}`,
	);
	console.log(`  ${c.dim("─".repeat(44))}\n`);

	const checks: Check[] = [];
	const { default: fs } = await import("fs-extra");

	// ─── 1. Config file present ────────────────────────────────────────────────
	if (cfg) {
		checks.push({
			name: "Config file",
			status: "pass",
			detail: "nx-factory.config.json found",
		});
		checks.push({
			name: "Package manager",
			status: "pass",
			detail: cfg.pkgManager,
		});
		checks.push({
			name: "UI package",
			status: "pass",
			detail: `packages/${cfg.uiPackage}`,
		});
	} else {
		checks.push({
			name: "Config file",
			status: "warn",
			detail:
				"nx-factory.config.json not found — run `nx-factory-cli init` or create manually",
		});
	}

	// ─── 2. Resolve UI package dir ────────────────────────────────────────────
	const uiPkgName = cfg?.uiPackage ?? "ui";
	const uiPkgDir = path.join(process.cwd(), "packages", uiPkgName);
	const hasUiPkg = await pathExists(uiPkgDir);

	if (!hasUiPkg) {
		checks.push({
			name: "UI package dir",
			status: "fail",
			detail: `packages/${uiPkgName} not found`,
		});
		renderChecks(checks);
		printError({
			title: "Critical: UI package directory missing",
			recovery: [{ label: "Re-initialise:", cmd: "nx-factory-cli init" }],
		});
		return;
	}
	checks.push({
		name: "UI package dir",
		status: "pass",
		detail: `packages/${uiPkgName} exists`,
	});

	// ─── 3. components.json ───────────────────────────────────────────────────
	const compJsonPath = path.join(uiPkgDir, "components.json");
	if (await pathExists(compJsonPath)) {
		try {
			const compJson = await fs.readJson(compJsonPath);
			const style = compJson?.style ?? "unknown";
			const aliases = compJson?.aliases ?? {};

			// Auto-fix: if aliases use relative paths (./...) swap them to @<scope>/<uiPkgName>/... style
			const hasRelativePaths = Object.values(aliases).some(
				(v) => typeof v === "string" && v.startsWith("./"),
			);

			if (hasRelativePaths) {
				const fixed = {
					...compJson,
					aliases: {
						components: `${scopedPackageName(scope, uiPkgName)}/components`,
						utils: `${scopedPackageName(scope, uiPkgName)}/lib/utils`,
						ui: `${scopedPackageName(scope, uiPkgName)}/components/ui`,
						lib: `${scopedPackageName(scope, uiPkgName)}/lib`,
						hooks: `${scopedPackageName(scope, uiPkgName)}/hooks`,
					},
				};
				await fs.writeJson(compJsonPath, fixed, { spaces: 2 });
				checks.push({
					name: "components.json",
					status: "fix",
					detail: `aliases rewritten from ./... to ${scopedPackageName(scope, uiPkgName)}/...`,
				});
			} else {
				checks.push({
					name: "components.json",
					status: "pass",
					detail: `style: ${style}`,
				});
			}
		} catch {
			checks.push({
				name: "components.json",
				status: "fail",
				detail: "invalid JSON",
			});
		}
	} else {
		checks.push({
			name: "components.json",
			status: "fail",
			detail: "missing — shadcn commands will not work",
		});
	}

	// ─── 4. TypeScript build setup ────────────────────────────────────────────
	const pkgJsonPath = path.join(uiPkgDir, "package.json");
	const barrelPath = path.join(uiPkgDir, "index.ts");

	if (await pathExists(pkgJsonPath)) {
		try {
			const pkgJson = await fs.readJson(pkgJsonPath);
			const buildScript = pkgJson?.scripts?.build;
			if (typeof buildScript === "string" && buildScript.includes("tsc")) {
				checks.push({
					name: "build script",
					status: "pass",
					detail: "tsc build script present",
				});
			} else {
				checks.push({
					name: "build script",
					status: "warn",
					detail: "missing tsc build script in package.json",
				});
			}
		} catch {
			checks.push({
				name: "build script",
				status: "warn",
				detail: "could not parse package.json",
			});
		}
	} else {
		checks.push({
			name: "build script",
			status: "warn",
			detail: "package.json missing in UI package",
		});
	}

	// ─── 4b. tsconfig paths (scoped alias required by this CLI setup) ─────
	const tsconfigPath = path.join(uiPkgDir, "tsconfig.json");
	if (await pathExists(tsconfigPath)) {
		try {
			const tsconfig = await fs.readJson(tsconfigPath);
			const paths = tsconfig?.compilerOptions?.paths ?? {};
			const hasAlias =
				`${scopedPackageName(scope, uiPkgName)}/*` in paths ||
				`@${scope}/*` in paths;

			if (!hasAlias) {
				// Auto-fix: inject baseUrl + paths
				tsconfig.compilerOptions = {
					...tsconfig.compilerOptions,
					baseUrl: ".",
					paths: {
						...(tsconfig.compilerOptions?.paths ?? {}),
						[`@${scope}/*`]: ["../../packages/*"],
						[scopedPackageName(scope, uiPkgName)]: ["./index.tsx"],
						[`${scopedPackageName(scope, uiPkgName)}/*`]: ["./*"],
					},
				};
				await fs.writeJson(tsconfigPath, tsconfig, { spaces: 2 });
				checks.push({
					name: "tsconfig paths",
					status: "fix",
					detail: `added @${scope} aliases for ${uiPkgName}`,
				});
			} else {
				checks.push({
					name: "tsconfig paths",
					status: "pass",
					detail: `@${scope} alias present`,
				});
			}
		} catch {
			checks.push({
				name: "tsconfig paths",
				status: "warn",
				detail: "could not parse tsconfig.json",
			});
		}
	} else {
		checks.push({
			name: "tsconfig paths",
			status: "warn",
			detail: "tsconfig.json missing in UI package",
		});
	}

	// ─── 5. Barrel export sync ────────────────────────────────────────────────
	const uiComponentsDir = path.join(uiPkgDir, "components/ui");
	let installed: string[] = [];

	if (await pathExists(uiComponentsDir)) {
		const files = await fs.readdir(uiComponentsDir);
		installed = files
			.filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
			.map((f) => f.replace(/\.tsx?$/, ""))
			.sort();
	}

	let barrelContent = "";
	if (await pathExists(barrelPath)) {
		barrelContent = await fs.readFile(barrelPath, "utf-8");
	}

	const exported = new Set(
		[...barrelContent.matchAll(/\.\/components\/ui\/([^"']+)/g)].map(
			(m) => m[1],
		),
	);
	const missing = installed.filter((comp) => !exported.has(comp));

	if (missing.length === 0) {
		checks.push({
			name: "Barrel exports",
			status: "pass",
			detail: `${installed.length} component${installed.length !== 1 ? "s" : ""} all exported`,
		});
	} else {
		// Auto-fix: append missing exports
		const newLines = missing
			.map((c) => `export * from "./components/ui/${c}.js";`)
			.join("\n");
		const updated = barrelContent.endsWith("\n")
			? barrelContent + newLines + "\n"
			: barrelContent + "\n" + newLines + "\n";
		await writeFile(barrelPath, updated);

		checks.push({
			name: "Barrel exports",
			status: "fix",
			detail: `added ${missing.length} missing export${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
		});
	}

	// ─── 6. Workspace protocol ────────────────────────────────────────────────
	if (cfg) {
		const appsDir = path.join(process.cwd(), "apps");
		if (await pathExists(appsDir)) {
			const apps = await fs.readdir(appsDir);
			const wrongProtocol: string[] = [];
			const expected = cfg.pkgManager === "npm" ? `"*"` : `"workspace:*"`;

			for (const app of apps) {
				const pkgPath = path.join(appsDir, app, "package.json");
				if (!(await pathExists(pkgPath))) continue;
				try {
					const pkgJson = await fs.readJson(pkgPath);
					const dep =
						pkgJson?.dependencies?.[scopedPackageName(scope, uiPkgName)];
					if (dep !== undefined) {
						const isCorrect =
							cfg.pkgManager === "npm" ? dep === "*" : dep === "workspace:*";
						if (!isCorrect)
							wrongProtocol.push(`${app} (has "${dep}", expected ${expected})`);
					}
				} catch {
					/* skip */
				}
			}

			if (wrongProtocol.length === 0) {
				checks.push({
					name: "Workspace protocol",
					status: "pass",
					detail: `${expected} used correctly`,
				});
			} else {
				checks.push({
					name: "Workspace protocol",
					status: "warn",
					detail: `wrong protocol in: ${wrongProtocol.join("; ")}`,
				});
			}
		}
	}

	// ─── Render all checks ────────────────────────────────────────────────────
	renderChecks(checks);

	const failures = checks.filter((ch) => ch.status === "fail");
	const warnings = checks.filter((ch) => ch.status === "warn");
	const fixes = checks.filter((ch) => ch.status === "fix");

	if (failures.length === 0 && warnings.length === 0) {
		printSuccess({
			title: "All checks passed",
			commands:
				fixes.length > 0
					? [
							{
								cmd: "index.ts updated",
								comment: "barrel exports were fixed automatically",
							},
						]
					: [
							{
								cmd: "nx-factory-cli list",
								comment: "view installed components",
							},
						],
		});
	} else {
		if (fixes.length > 0) {
			console.log(
				`  ${c.green("✓")}  ${c.green(`Auto-fixed ${fixes.length} issue${fixes.length > 1 ? "s" : ""}`)}\n`,
			);
		}
		if (warnings.length > 0 || failures.length > 0) {
			printWarn(
				`${warnings.length + failures.length} issue${warnings.length + failures.length > 1 ? "s" : ""} need attention`,
				"See details above",
			);
		}
	}
}

function renderChecks(checks: Check[]): void {
	for (const ch of checks) {
		const icon =
			ch.status === "pass"
				? c.green("✓")
				: ch.status === "fix"
					? c.cyan("↻")
					: ch.status === "warn"
						? c.yellow("⚠")
						: c.red("✗");
		const label = c.white(ch.name.padEnd(22));
		const detail =
			ch.status === "fix"
				? c.cyan(ch.detail)
				: ch.status === "fail"
					? c.red(ch.detail)
					: ch.status === "warn"
						? c.yellow(ch.detail)
						: c.dim(ch.detail);

		console.log(`  ${icon}  ${label}  ${detail}`);
	}
	console.log();
}
