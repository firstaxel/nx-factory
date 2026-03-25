import inquirer from "inquirer";
import path from "path";
import { pathExists, writeFile } from "../files.js";
import { run, pmx, pmxArgs, detectPackageManager } from "../exec.js";
import { q, c, printSuccess, printError } from "../ui.js";

const ALL_SHADCN_COMPONENTS = [
  "accordion", "alert", "alert-dialog", "aspect-ratio", "avatar",
  "badge", "breadcrumb", "button", "calendar", "card", "carousel",
  "chart", "checkbox", "collapsible", "command", "context-menu",
  "dialog", "drawer", "dropdown-menu", "form", "hover-card",
  "input", "input-otp", "label", "menubar", "navigation-menu",
  "pagination", "popover", "progress", "radio-group", "resizable",
  "scroll-area", "select", "separator", "sheet", "sidebar",
  "skeleton", "slider", "sonner", "switch", "table", "tabs",
  "textarea", "toast", "toggle", "toggle-group", "tooltip",
];

export async function addComponentCommand(components: string[]): Promise<void> {
  const uiPkgDir = await detectUiPackageDir();
  if (!uiPkgDir) {
    printError({
      title:    "UI package not found",
      detail:   "Run from the monorepo root or packages/ui directory.",
      recovery: [
        { label: "From monorepo root:", cmd: "nx-factory add-component button" },
        { label: "Or from the UI package:", cmd: "cd packages/ui && nx-factory add-component button" },
      ],
    });
    process.exit(1); return;
  }

  let selectedComponents = components;

  if (selectedComponents.length === 0) {
    const answers = await inquirer.prompt({
      type:     "checkbox",
      name:     "components",
      message:  q("Which shadcn components do you want to add?", "space to toggle · enter to confirm"),
      choices:  ALL_SHADCN_COMPONENTS,
      validate: (v: readonly unknown[]) => v.length > 0 || c.red("Select at least one component"),
    });
    selectedComponents = answers.components as string[];
  }

  const pm      = (await detectPackageManager()) ?? "npm";
  const pkgName = path.basename(uiPkgDir);

  console.log(`\n  ${c.dim("─".repeat(36))}`);
  console.log(`  ${c.dim(`Adding to @workspace/${pkgName}: ${selectedComponents.join(", ")}`)}`);
  console.log(`  ${c.dim("─".repeat(36))}\n`);

  try {
    await run(
      pmx(pm),
      pmxArgs(pm, "shadcn@latest", ["add", "--yes", ...selectedComponents]),
      { cwd: uiPkgDir },
    );

    await updateBarrelExports(uiPkgDir, selectedComponents);

    const importCommands = selectedComponents.map((comp) => ({
      cmd: `import { ${toComponentName(comp)} } from "@workspace/${pkgName}/components/ui/${comp}";`,
      comment: "direct import (no barrel)",
    }));

    printSuccess({
      title:    `${selectedComponents.length} component${selectedComponents.length > 1 ? "s" : ""} added`,
      commands: importCommands,
    });
  } catch (err) {
    printError({
      title:    "Failed to add components",
      detail:   String(err).split("\n")[0],
      recovery: selectedComponents.map((comp) => ({
        label: "",
        cmd:   `${pmx(pm)} ${pmxArgs(pm, "shadcn@latest", ["add", comp]).join(" ")}`,
      })),
    });
    process.exit(1); return;
  }
}

async function detectUiPackageDir(): Promise<string | null> {
  if (await pathExists(path.join(process.cwd(), "components.json"))) {
    return process.cwd();
  }

  const packagesDir = path.join(process.cwd(), "packages");
  if (await pathExists(packagesDir)) {
    const { default: fs } = await import("fs-extra");
    const dirs = await fs.readdir(packagesDir);
    for (const d of dirs) {
      const candidate = path.join(packagesDir, d);
      if (await pathExists(path.join(candidate, "components.json"))) {
        return candidate;
      }
    }
  }

  return null;
}

async function updateBarrelExports(uiPkgDir: string, components: string[]): Promise<void> {
  const indexTsxPath = path.join(uiPkgDir, "index.tsx");
  const indexTsPath = path.join(uiPkgDir, "index.ts");
  const indexPath = (await pathExists(indexTsxPath)) ? indexTsxPath : indexTsPath;
  const { default: fs } = await import("fs-extra");
  const pkgName = path.basename(uiPkgDir);

  let existing = "";
  if (await pathExists(indexPath)) {
    existing = await fs.readFile(indexPath, "utf-8");
  }

  const newExports = components
    .filter((comp) => !existing.includes(`@workspace/${pkgName}/components/ui/${comp}`))
    .map((comp)    => `export * from "@workspace/${pkgName}/components/ui/${comp}";`)
    .join("\n");

  if (newExports) {
    if (existing && !existing.endsWith("\n")) existing += "\n";
    await writeFile(indexPath, existing + newExports + "\n");
    console.log(`  ${c.dim("✓")} ${c.dim("barrel exports updated in index.ts")}`);
  }
}

function toComponentName(kebab: string): string {
  return kebab
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
