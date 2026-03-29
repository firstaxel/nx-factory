import path from "path";
import { pathExists, writeJson, writeFile, ensureDir } from "../files.js";
import { loadConfig } from "../config.js";
import { run, pmx, pmxArgs, pmAdd, detectPackageManager } from "../exec.js";
import { c, createStepRunner, printSection, printSuccess, printError, printWarn } from "../ui.js";

interface AddStorybookOptions {
  dryRun?: boolean;
}

export async function addStorybookCommand(options: AddStorybookOptions): Promise<void> {
  const cfg      = await loadConfig();
  const uiPkgDir = await detectUiPackageDir(cfg?.uiPackage);

  if (!uiPkgDir) {
    printError({
      title:    "UI package not found",
      detail:   "Run from the monorepo root.",
      recovery: [{ label: "", cmd: "cd <monorepo-root> && nx-factory add-storybook" }],
    });
    process.exit(1); return;
  }

  // Check Storybook isn't already present
  const storybookDir = path.join(uiPkgDir, ".storybook");
  if (await pathExists(storybookDir)) {
    printWarn(
      "Storybook already configured",
      `Found .storybook/ in packages/${cfg?.uiPackage ?? "ui"}`,
    );
    return;
  }

  const pm       = (await detectPackageManager()) ?? cfg?.pkgManager ?? "pnpm";
  const pkgName  = cfg?.uiPackage ?? path.basename(uiPkgDir);
  const installed = await getInstalledComponents(uiPkgDir);

  printSection(`${options.dryRun ? "[dry run] " : ""}Adding Storybook to packages/${pkgName}`);

  const step = createStepRunner(4, options.dryRun);

  await step("Install Storybook deps", async () => {
    await run(pm, [
      pmAdd(pm), "--save-dev",
      "@storybook/react-vite",
      "@storybook/react",
      "@storybook/addon-essentials",
      "@storybook/addon-a11y",
      "storybook",
    ], { cwd: uiPkgDir });
  });

  await step("Write .storybook config", async () => {
    await ensureDir(storybookDir);

    await writeFile(
      path.join(storybookDir, "main.ts"),
      `import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories:   ["../**/*.stories.@(ts|tsx)"],
  addons:    [
    "@storybook/addon-essentials",
    "@storybook/addon-a11y",
  ],
  framework: {
    name:    "@storybook/react-vite",
    options: {},
  },
};

export default config;
`,
    );

    await writeFile(
      path.join(storybookDir, "preview.ts"),
      `import type { Preview } from "@storybook/react";
import "../styles/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color:  /(background|color)$/i,
        date:   /Date$/i,
      },
    },
  },
};

export default preview;
`,
    );
  });

  await step("Add storybook scripts to package.json", async () => {
    const { default: fs } = await import("fs-extra");
    const pkgJsonPath = path.join(uiPkgDir, "package.json");
    const pkgJson     = await fs.readJson(pkgJsonPath);

    pkgJson.scripts = {
      ...pkgJson.scripts,
      storybook:       "storybook dev --port 6006",
      "build-storybook": "storybook build",
    };

    await fs.writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
  });

  await step(`Generate ${installed.length} component stories`, async () => {
    const storiesDir = path.join(uiPkgDir, "stories");
    await ensureDir(storiesDir);

    for (const comp of installed) {
      const compName  = toComponentName(comp);
      const storyPath = path.join(storiesDir, `${compName}.stories.tsx`);

      // Don't overwrite existing stories
      if (await pathExists(storyPath)) continue;

      await writeFile(storyPath, buildStory(compName, comp, pkgName));
    }

    // Write an index story if no components installed yet
    if (installed.length === 0) {
      await writeFile(
        path.join(storiesDir, "Welcome.stories.tsx"),
        `import type { Meta, StoryObj } from "@storybook/react";

const Welcome = () => (
  <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
    <h1>Welcome to @workspace/${pkgName}</h1>
    <p>Add components with: <code>nx-factory add-component button</code></p>
  </div>
);

const meta: Meta<typeof Welcome> = {
  title:     "Welcome",
  component: Welcome,
};
export default meta;
type Story = StoryObj<typeof Welcome>;

export const Default: Story = {};
`,
      );
    }
  });

  printSuccess({
    title:    `Storybook added to packages/${pkgName}`,
    commands: [
      { cmd: `${pm} nx run ${pkgName}:storybook`, comment: "start Storybook on :6006" },
      { cmd: `${pm} nx run ${pkgName}:build-storybook`, comment: "build static output" },
    ],
    tips: [
      { label: "Stories live at:", cmd: `packages/${pkgName}/stories/` },
    ],
  });
}

// ─── Story template ──────────────────────────────────────────────────────────
function buildStory(compName: string, compSlug: string, pkgName: string): string {
  // Simple stories work for all components; complex ones (e.g. Dialog) would
  // need customisation — we generate a useful default that compiles cleanly.
  return `import type { Meta, StoryObj } from "@storybook/react";
import { ${compName} } from "@workspace/${pkgName}";

const meta: Meta<typeof ${compName}> = {
  title:     "ui/${compName}",
  component: ${compName},
  tags:      ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof ${compName}>;

export const Default: Story = {};
`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getInstalledComponents(uiPkgDir: string): Promise<string[]> {
  const dir = path.join(uiPkgDir, "components/ui");
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

function toComponentName(kebab: string): string {
  return kebab.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}
