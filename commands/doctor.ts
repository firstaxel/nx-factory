import path from "path";
import { pathExists, writeFile } from "../files.js";
import { loadConfig } from "../config.js";
import { c, printSuccess, printError, printWarn } from "../ui.js";

interface Check {
  name:   string;
  status: "pass" | "warn" | "fail" | "fix";
  detail: string;
}

export async function doctorCommand(): Promise<void> {
  const cfg = await loadConfig();

  console.log(`\n  ${c.dim("─".repeat(44))}`);
  console.log(`  ${c.whiteBold("nx-shadcn doctor")}  ${c.dim("workspace health check")}`);
  console.log(`  ${c.dim("─".repeat(44))}\n`);

  const checks: Check[] = [];
  const { default: fs }  = await import("fs-extra");

  // ─── 1. Config file present ────────────────────────────────────────────────
  if (cfg) {
    checks.push({ name: "Config file",        status: "pass", detail: "nx-shadcn.config.json found" });
    checks.push({ name: "Package manager",    status: "pass", detail: cfg.pkgManager });
    checks.push({ name: "UI package",         status: "pass", detail: `packages/${cfg.uiPackage}` });
  } else {
    checks.push({
      name:   "Config file",
      status: "warn",
      detail: "nx-shadcn.config.json not found — run `nx-shadcn init` or create manually",
    });
  }

  // ─── 2. Resolve UI package dir ────────────────────────────────────────────
  const uiPkgName = cfg?.uiPackage ?? "ui";
  const uiPkgDir  = path.join(process.cwd(), "packages", uiPkgName);
  const hasUiPkg  = await pathExists(uiPkgDir);

  if (!hasUiPkg) {
    checks.push({ name: "UI package dir", status: "fail", detail: `packages/${uiPkgName} not found` });
    renderChecks(checks);
    printError({
      title:    "Critical: UI package directory missing",
      recovery: [{ label: "Re-initialise:", cmd: "nx-shadcn init" }],
    });
    return;
  }
  checks.push({ name: "UI package dir", status: "pass", detail: `packages/${uiPkgName} exists` });

  // ─── 3. components.json ───────────────────────────────────────────────────
  const compJsonPath = path.join(uiPkgDir, "components.json");
  if (await pathExists(compJsonPath)) {
    try {
      const compJson = await fs.readJson(compJsonPath);
      const style    = compJson?.style ?? "unknown";
      const aliases  = compJson?.aliases ?? {};

      // Auto-fix: if aliases use relative paths (./src/...) swap them to @/ style
      const hasRelativePaths = Object.values(aliases).some(
        (v) => typeof v === "string" && v.startsWith("./"),
      );

      if (hasRelativePaths) {
        const fixed = {
          ...compJson,
          aliases: {
            components: "@/components",
            utils:      "@/lib/utils",
            ui:         "@/components/ui",
            lib:        "@/lib",
            hooks:      "@/hooks",
          },
        };
        await fs.writeJson(compJsonPath, fixed, { spaces: 2 });
        checks.push({
          name:   "components.json",
          status: "fix",
          detail: `aliases rewritten from ./src/... to @/... (shadcn requires path aliases)`,
        });
      } else {
        checks.push({ name: "components.json", status: "pass", detail: `style: ${style}` });
      }
    } catch {
      checks.push({ name: "components.json", status: "fail", detail: "invalid JSON" });
    }
  } else {
    checks.push({ name: "components.json", status: "fail", detail: "missing — shadcn commands will not work" });
  }

  // ─── 4. tsup entry point ──────────────────────────────────────────────────
  const tsupCfgPath = path.join(uiPkgDir, "tsup.config.ts");
  const barrelPath  = path.join(uiPkgDir, "src/index.ts");

  if (await pathExists(tsupCfgPath)) {
    checks.push({ name: "tsup.config.ts", status: "pass", detail: "build config present" });
  } else {
    checks.push({ name: "tsup.config.ts", status: "warn", detail: "missing — `pnpm build` will not work" });
  }

  // ─── 4b. tsconfig paths (@/* alias required by shadcn) ────────────────────
  const tsconfigPath = path.join(uiPkgDir, "tsconfig.json");
  if (await pathExists(tsconfigPath)) {
    try {
      const tsconfig = await fs.readJson(tsconfigPath);
      const paths    = tsconfig?.compilerOptions?.paths ?? {};
      const hasAlias = "@/*" in paths || "@/components" in paths;

      if (!hasAlias) {
        // Auto-fix: inject baseUrl + paths
        tsconfig.compilerOptions = {
          ...tsconfig.compilerOptions,
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
        };
        await fs.writeJson(tsconfigPath, tsconfig, { spaces: 2 });
        checks.push({
          name:   "tsconfig paths",
          status: "fix",
          detail: `added baseUrl + paths: { "@/*": ["./src/*"] }`,
        });
      } else {
        checks.push({ name: "tsconfig paths", status: "pass", detail: `@/* alias present` });
      }
    } catch {
      checks.push({ name: "tsconfig paths", status: "warn", detail: "could not parse tsconfig.json" });
    }
  } else {
    checks.push({ name: "tsconfig paths", status: "warn", detail: "tsconfig.json missing in UI package" });
  }

  // ─── 5. Barrel export sync ────────────────────────────────────────────────
  const uiComponentsDir = path.join(uiPkgDir, "src/components/ui");
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

  const exported    = new Set(
    [...barrelContent.matchAll(/\.\/components\/ui\/([^"']+)/g)].map((m) => m[1]),
  );
  const missing = installed.filter((comp) => !exported.has(comp));

  if (missing.length === 0) {
    checks.push({
      name:   "Barrel exports",
      status: "pass",
      detail: `${installed.length} component${installed.length !== 1 ? "s" : ""} all exported`,
    });
  } else {
    // Auto-fix: append missing exports
    const newLines = missing.map((c) => `export * from "./components/ui/${c}";`).join("\n");
    const updated  = barrelContent.endsWith("\n")
      ? barrelContent + newLines + "\n"
      : barrelContent + "\n" + newLines + "\n";
    await writeFile(barrelPath, updated);

    checks.push({
      name:   "Barrel exports",
      status: "fix",
      detail: `added ${missing.length} missing export${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    });
  }

  // ─── 6. Workspace protocol ────────────────────────────────────────────────
  if (cfg) {
    const appsDir = path.join(process.cwd(), "apps");
    if (await pathExists(appsDir)) {
      const apps         = await fs.readdir(appsDir);
      const wrongProtocol: string[] = [];
      const expected     = cfg.pkgManager === "npm" ? `"*"` : `"workspace:*"`;

      for (const app of apps) {
        const pkgPath = path.join(appsDir, app, "package.json");
        if (!(await pathExists(pkgPath))) continue;
        try {
          const pkgJson = await fs.readJson(pkgPath);
          const dep = pkgJson?.dependencies?.[`@workspace/${uiPkgName}`];
          if (dep !== undefined) {
            const isCorrect =
              cfg.pkgManager === "npm"
                ? dep === "*"
                : dep === "workspace:*";
            if (!isCorrect) wrongProtocol.push(`${app} (has "${dep}", expected ${expected})`);
          }
        } catch { /* skip */ }
      }

      if (wrongProtocol.length === 0) {
        checks.push({ name: "Workspace protocol", status: "pass", detail: `${expected} used correctly` });
      } else {
        checks.push({
          name:   "Workspace protocol",
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
  const fixes    = checks.filter((ch) => ch.status === "fix");

  if (failures.length === 0 && warnings.length === 0) {
    printSuccess({
      title:    "All checks passed",
      commands: fixes.length > 0
        ? [{ cmd: "src/index.ts updated", comment: "barrel exports were fixed automatically" }]
        : [{ cmd: "nx-shadcn list", comment: "view installed components" }],
    });
  } else {
    if (fixes.length > 0) {
      console.log(`  ${c.green("✓")}  ${c.green(`Auto-fixed ${fixes.length} issue${fixes.length > 1 ? "s" : ""}`)}\n`);
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
      ch.status === "pass" ? c.green("✓") :
      ch.status === "fix"  ? c.cyan("↻")  :
      ch.status === "warn" ? c.yellow("⚠") :
                             c.red("✗");
    const label = c.white(ch.name.padEnd(22));
    const detail = ch.status === "fix"
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
