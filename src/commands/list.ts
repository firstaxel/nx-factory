import path from "path";
import { pathExists } from "../files.js";
import { loadConfig } from "../config.js";
import { c, printError } from "../ui.js";

export async function listCommand(): Promise<void> {
  const cfg = await loadConfig();

  // Resolve UI package dir
  const uiPkgDir = await detectUiPackageDir(cfg?.uiPackage);
  if (!uiPkgDir) {
    printError({
      title:    "UI package not found",
      detail:   "Run from the monorepo root.",
      recovery: [{ label: "", cmd: "cd <monorepo-root> && nx-factory list" }],
    });
    process.exit(1); return;
  }

  const { default: fs } = await import("fs-extra");

  // ─── Installed components ──────────────────────────────────────────────────
  const uiComponentsDir = path.join(uiPkgDir, "src/components/ui");
  let installed: string[] = [];

  if (await pathExists(uiComponentsDir)) {
    const files = await fs.readdir(uiComponentsDir);
    installed = files
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .map((f) => f.replace(/\.tsx?$/, ""))
      .sort();
  }

  // ─── Barrel export check ───────────────────────────────────────────────────
  const barrelPath = path.join(uiPkgDir, "src/index.ts");
  let barrelContent = "";
  if (await pathExists(barrelPath)) {
    barrelContent = await fs.readFile(barrelPath, "utf-8");
  }

  const exported    = new Set(
    [...barrelContent.matchAll(/\.\/components\/ui\/([^"']+)/g)].map((m) => m[1]),
  );
  const notExported = installed.filter((comp) => !exported.has(comp));

  // ─── App import scan ───────────────────────────────────────────────────────
  const appsDir = path.join(process.cwd(), "apps");
  const importMap = new Map<string, string[]>(); // component → apps[]

  if (await pathExists(appsDir)) {
    const apps = await fs.readdir(appsDir);
    for (const app of apps) {
      const appSrc = path.join(appsDir, app, "src");
      if (!(await pathExists(appSrc))) continue;
      const files = await collectTsFiles(appSrc);
      for (const file of files) {
        const content = await fs.readFile(file, "utf-8");
        for (const comp of installed) {
          const name = toComponentName(comp);
          if (content.includes(name)) {
            if (!importMap.has(comp)) importMap.set(comp, []);
            if (!importMap.get(comp)!.includes(app)) {
              importMap.get(comp)!.push(app);
            }
          }
        }
      }
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const pkgName = cfg?.uiPackage ?? path.basename(uiPkgDir);

  console.log(`\n  ${c.dim("─".repeat(44))}`);
  console.log(`  ${c.whiteBold(`@workspace/${pkgName}`)}  ${c.dim(`${installed.length} component${installed.length !== 1 ? "s" : ""}`)}`);
  console.log(`  ${c.dim("─".repeat(44))}\n`);

  if (installed.length === 0) {
    console.log(`  ${c.dim("No components installed yet.")}`);
    console.log(`  ${c.dim("Run: ")}${c.purple("nx-factory add-component button card")}\n`);
    return;
  }

  // Column layout
  const colW = 24;
  for (const comp of installed) {
    const inBarrel  = exported.has(comp);
    const usedIn    = importMap.get(comp) ?? [];
    const barrelTag = inBarrel ? c.green("✓") : c.yellow("!");
    const usageTxt  = usedIn.length > 0
      ? c.dim(`used in: ${usedIn.join(", ")}`)
      : c.dim("not imported by any app");

    console.log(`  ${barrelTag}  ${c.white(comp.padEnd(colW))}  ${usageTxt}`);
  }

  if (notExported.length > 0) {
    console.log(`\n  ${c.yellow("⚠")}  ${c.yellow(`${notExported.length} component${notExported.length > 1 ? "s" : ""} missing from barrel export:`)}`);
    console.log(`     ${c.dim(notExported.join(", "))}`);
    console.log(`     ${c.dim("Run ")}${c.purple("nx-factory doctor")}${c.dim(" to fix automatically")}`);
  }

  console.log();
}

async function detectUiPackageDir(uiPackage?: string): Promise<string | null> {
  const base = uiPackage ?? "ui";

  // Try config-specified name first
  const configured = path.join(process.cwd(), "packages", base);
  if (await pathExists(path.join(configured, "components.json"))) return configured;

  // Already inside the UI package
  if (await pathExists(path.join(process.cwd(), "components.json"))) return process.cwd();

  // Scan packages/*
  const packagesDir = path.join(process.cwd(), "packages");
  if (await pathExists(packagesDir)) {
    const { default: fs } = await import("fs-extra");
    const dirs = await fs.readdir(packagesDir);
    for (const d of dirs) {
      const candidate = path.join(packagesDir, d);
      if (await pathExists(path.join(candidate, "components.json"))) return candidate;
    }
  }

  return null;
}

async function collectTsFiles(dir: string): Promise<string[]> {
  const { default: fs } = await import("fs-extra");
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...(await collectTsFiles(full)));
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function toComponentName(kebab: string): string {
  return kebab.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}
