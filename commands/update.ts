import inquirer from "inquirer";
import path from "path";
import { pathExists } from "../files.js";
import { loadConfig } from "../config.js";
import { run, pmx, pmxArgs, detectPackageManager } from "../exec.js";
import { c, q, createStepRunner, printSuccess, printError } from "../ui.js";

export async function updateCommand(
  components: string[],
  opts: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
  const cfg      = await loadConfig();
  const uiPkgDir = await detectUiPackageDir(cfg?.uiPackage);

  if (!uiPkgDir) {
    printError({
      title:    "UI package not found",
      detail:   "Run from the monorepo root.",
      recovery: [{ label: "", cmd: "nx-shadcn update" }],
    });
    process.exit(1); return;
  }

  const installed = await getInstalledComponents(uiPkgDir);
  if (installed.length === 0) {
    console.log(`\n  ${c.dim("No components installed. Nothing to update.")}\n`);
    return;
  }

  // Determine which components to update
  let targets = components.length > 0 ? components : installed;

  // Validate any explicitly-named components exist
  const unknown = targets.filter((t) => !installed.includes(t));
  if (unknown.length > 0) {
    printError({
      title:    `Unknown component${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`,
      detail:   "These are not installed in the UI package.",
      recovery: [{ label: "Installed components:", cmd: installed.join("  ") }],
    });
    process.exit(1); return;
  }

  // If updating all, confirm unless --yes
  if (components.length === 0 && !opts.yes) {
    const { selected } = await inquirer.prompt({
      type:     "checkbox",
      name:     "selected",
      message:  q("Which components do you want to update?", "defaults to all · space to deselect"),
      choices:  installed.map((comp) => ({ name: comp, value: comp, checked: true })),
      validate: (v: readonly unknown[]) => v.length > 0 || "Select at least one component",
    });
    targets = selected as string[];
  }

  const pm = (await detectPackageManager()) ?? (cfg?.pkgManager ?? "npm");

  console.log(`\n  ${c.dim("─".repeat(44))}`);
  console.log(`  ${c.whiteBold("Updating")}  ${c.dim(targets.join(", "))}`);
  console.log(`  ${c.dim("─".repeat(44))}\n`);

  if (opts.dryRun) {
    const step = createStepRunner(targets.length, true);
    for (const comp of targets) {
      await step(`Update ${comp}`, async () => {});
    }
    printSuccess({
      title:    `${targets.length} component${targets.length > 1 ? "s" : ""} would be updated (dry run)`,
      commands: [{ cmd: `nx-shadcn update ${targets.join(" ")}`, comment: "run without --dry-run to apply" }],
    });
    return;
  }

  const step    = createStepRunner(targets.length);
  const updated: string[] = [];
  const failed:  string[] = [];

  for (const comp of targets) {
    await step(`Update ${comp}`, async () => {
      try {
        await run(
          pmx(pm),
          pmxArgs(pm, "shadcn@latest", ["add", "--yes", "--overwrite", comp]),
          { cwd: uiPkgDir },
        );
        updated.push(comp);
      } catch {
        failed.push(comp);
        throw new Error(`shadcn update failed for ${comp}`);
      }
    });
  }

  if (failed.length > 0) {
    printError({
      title:    `Failed to update: ${failed.join(", ")}`,
      recovery: failed.map((comp) => ({
        label: "",
        cmd:   `${pmx(pm)} ${pmxArgs(pm, "shadcn@latest", ["add", "--overwrite", comp]).join(" ")}`,
      })),
    });
  }

  if (updated.length > 0) {
    printSuccess({
      title:    `${updated.length} component${updated.length > 1 ? "s" : ""} updated`,
      commands: [
        { cmd: `pnpm nx build @workspace/${cfg?.uiPackage ?? "ui"}`, comment: "rebuild to pick up changes" },
      ],
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
