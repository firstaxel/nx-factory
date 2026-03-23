import inquirer from "inquirer";
import path from "path";
import { pathExists, writeFile } from "../files.js";
import { loadConfig } from "../config.js";
import { c, q, printSuccess, printError, printWarn } from "../ui.js";

export async function removeComponentCommand(
  components: string[],
  opts: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
  const cfg       = await loadConfig();
  const uiPkgDir  = await detectUiPackageDir(cfg?.uiPackage);

  if (!uiPkgDir) {
    printError({
      title:    "UI package not found",
      detail:   "Run from the monorepo root.",
      recovery: [{ label: "", cmd: "cd <monorepo-root> && nx-shadcn remove-component button" }],
    });
    process.exit(1); return;
  }

  // If no args, show installed components as a checkbox list
  if (components.length === 0) {
    const installed = await getInstalledComponents(uiPkgDir);
    if (installed.length === 0) {
      console.log(`\n  ${c.dim("No components installed.")}\n`);
      return;
    }
    const { selected } = await inquirer.prompt({
      type:     "checkbox",
      name:     "selected",
      message:  q("Which components do you want to remove?", "space to toggle · enter to confirm"),
      choices:  installed,
      validate: (v: readonly unknown[]) => v.length > 0 || c.red("Select at least one"),
    });
    components = selected as string[];
  }

  // ─── App usage scan ────────────────────────────────────────────────────────
  const usageWarnings: string[] = [];
  const appsDir = path.join(process.cwd(), "apps");

  if (await pathExists(appsDir)) {
    const { default: fs } = await import("fs-extra");
    const apps = await fs.readdir(appsDir);
    for (const app of apps) {
      const appSrc = path.join(appsDir, app, "src");
      if (!(await pathExists(appSrc))) continue;
      const files = await collectTsFiles(appSrc);
      for (const file of files) {
        const content = await fs.readFile(file, "utf-8");
        for (const comp of components) {
          const name = toComponentName(comp);
          if (content.includes(name)) {
            usageWarnings.push(`${app} imports ${name}`);
            break;
          }
        }
      }
    }
  }

  if (usageWarnings.length > 0) {
    printWarn(
      `${usageWarnings.length} app${usageWarnings.length > 1 ? "s" : ""} still import${usageWarnings.length === 1 ? "s" : ""} these components`,
      usageWarnings.join(" · "),
    );
    if (!opts.yes) {
      const { confirmed } = await inquirer.prompt({
        type:    "confirm",
        name:    "confirmed",
        message: q("Remove anyway?"),
        default: false,
      });
      if (!confirmed) {
        console.log(`\n  ${c.dim("Aborted.")}\n`);
        return;
      }
    }
  }

  const { default: fs } = await import("fs-extra");
  const removed: string[] = [];
  const failed:  string[] = [];

  for (const comp of components) {
    const compFile = path.join(uiPkgDir, "src/components/ui", `${comp}.tsx`);
    const exists   = await pathExists(compFile);

    if (!exists) {
      console.log(`  ${c.yellow("⚠")}  ${c.dim(`${comp} — file not found, skipping`)}`);
      continue;
    }

    if (opts.dryRun) {
      console.log(`  ${c.purpleDim("│")}  ${c.dim(`[dry run] would remove: src/components/ui/${comp}.tsx`)}`);
      removed.push(comp);
      continue;
    }

    try {
      await fs.remove(compFile);
      removed.push(comp);
    } catch {
      failed.push(comp);
    }
  }

  // ─── Update barrel exports ─────────────────────────────────────────────────
  if (removed.length > 0 && !opts.dryRun) {
    const barrelPath = path.join(uiPkgDir, "src/index.ts");
    if (await pathExists(barrelPath)) {
      let barrel = await fs.readFile(barrelPath, "utf-8");
      for (const comp of removed) {
        barrel = barrel
          .split("\n")
          .filter((line) => !line.includes(`./components/ui/${comp}`))
          .join("\n");
      }
      await writeFile(barrelPath, barrel);
      console.log(`  ${c.dim("✓")} ${c.dim("barrel exports updated")}`);
    }
  }

  if (failed.length > 0) {
    printWarn(`Failed to remove: ${failed.join(", ")}`, "Try removing manually from src/components/ui/");
  }

  if (removed.length > 0) {
    printSuccess({
      title:    opts.dryRun
        ? `${removed.length} component${removed.length > 1 ? "s" : ""} would be removed (dry run)`
        : `${removed.length} component${removed.length > 1 ? "s" : ""} removed`,
      commands: opts.dryRun
        ? [{ cmd: "nx-shadcn remove-component " + removed.join(" "), comment: "run without --dry-run to apply" }]
        : [{ cmd: `pnpm nx build @workspace/${cfg?.uiPackage ?? "ui"}`, comment: "rebuild the UI package" }],
    });
  }
}

async function getInstalledComponents(uiPkgDir: string): Promise<string[]> {
  const dir = path.join(uiPkgDir, "src/components/ui");
  if (!(await pathExists(dir))) return [];
  const { default: fs } = await import("fs-extra");
  const files = await fs.readdir(dir);
  return files
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => f.replace(/\.tsx?$/, ""))
    .sort();
}

async function detectUiPackageDir(uiPackage?: string): Promise<string | null> {
  const base = uiPackage ?? "ui";
  const configured = path.join(process.cwd(), "packages", base);
  if (await pathExists(path.join(configured, "components.json"))) return configured;
  if (await pathExists(path.join(process.cwd(), "components.json"))) return process.cwd();
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
