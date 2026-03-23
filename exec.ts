import { execa, type Options } from "execa";
import ora from "ora";
import chalk from "chalk";

export async function run(
  cmd: string,
  args: string[],
  opts: Options & { label?: string } = {}
): Promise<void> {
  const { label, ...execaOpts } = opts;
  const spinner = label ? ora(label).start() : null;
  try {
    await execa(cmd, args, { stdio: spinner ? "pipe" : "inherit", ...execaOpts });
    spinner?.succeed(chalk.green(label));
  } catch (err) {
    spinner?.fail(chalk.red(label));
    throw err;
  }
}

/** Always inherits stdio — use for interactive CLIs (create-next-app, create-remix, etc.) */
export async function runInteractive(
  cmd: string,
  args: string[],
  opts: Omit<Options, "stdio"> = {}
): Promise<void> {
  await execa(cmd, args, { stdio: "inherit", ...opts });
}

export async function runInDir(
  cwd: string,
  cmd: string,
  args: string[],
  label?: string
): Promise<void> {
  await run(cmd, args, { cwd, label });
}

/**
 * Detects the package manager in use by inspecting lockfiles in `cwd` (defaults to process.cwd()).
 * Returns null if no lockfile is found.
 */
export async function detectPackageManager(cwd = process.cwd()): Promise<string | null> {
  const { default: fs } = await import("fs-extra");
  if (await fs.pathExists(`${cwd}/pnpm-workspace.yaml`)) return "pnpm";
  if (await fs.pathExists(`${cwd}/pnpm-lock.yaml`)) return "pnpm";
  if (await fs.pathExists(`${cwd}/bun.lockb`)) return "bun";
  if (await fs.pathExists(`${cwd}/yarn.lock`)) return "yarn";
  if (await fs.pathExists(`${cwd}/package-lock.json`)) return "npm";
  return null;
}

export function pmx(pm: string): string {
  if (pm === "pnpm") return "pnpm";
  if (pm === "bun") return "bunx";
  if (pm === "yarn") return "yarn";
  return "npx"; // npm
}

/** Args to prefix a dlx-style command, e.g. ["dlx", "shadcn@latest", ...] for pnpm */
export function pmxArgs(pm: string, pkg: string, args: string[]): string[] {
  if (pm === "pnpm") return ["dlx", pkg, ...args];
  if (pm === "yarn") return ["dlx", pkg, ...args];
  return [pkg, ...args]; // npx / bunx — cmd is the binary itself
}

/** The subcommand used to add a dependency ("add" vs "install") */
export function pmAdd(pm: string): string {
  // npm is the odd one out; everyone else uses "add"
  return pm === "npm" ? "install" : "add";
}

export function pmRun(pm: string): string[] {
  if (pm === "pnpm") return ["pnpm", "run"];
  if (pm === "bun") return ["bun", "run"];
  if (pm === "yarn") return ["yarn", "run"];
  return ["npm", "run"];
}

/**
 * Returns the correct workspace version specifier for the given package manager.
 * pnpm / bun / yarn use  "workspace:*"
 * npm uses                "*"  (relies on workspaces field in root package.json)
 */
export function pmWorkspaceProtocol(pm: string): string {
  return pm === "npm" ? "*" : "workspace:*";
}
