import path from "path";
import { pathExists } from "./files.js";
import { CONFIG_FILENAME, findConfig } from "./config.js";

/**
 * Resolves the monorepo root from any working directory.
 *
 * Strategy (in order):
 *  1. Walk up from process.cwd() looking for nx-factory.config.json
 *  2. Walk up looking for nx.json (an Nx workspace marker)
 *  3. Walk up looking for a package.json that has a "workspaces" field
 *  4. Fall back to process.cwd() with a warning
 *
 * Returns the absolute path to the monorepo root.
 */
export async function resolveMonorepoRoot(): Promise<string> {
  // Strategy 1: nx-factory.config.json
  const configFile = await findConfig();
  if (configFile) {
    return path.dirname(configFile);
  }

  // Strategy 2 & 3: walk up from cwd
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (await pathExists(path.join(dir, "nx.json"))) {
      return dir;
    }
    if (await pathExists(path.join(dir, "package.json"))) {
      const { default: fs } = await import("fs-extra");
      try {
        const pkg = await fs.readJson(path.join(dir, "package.json"));
        if (pkg.workspaces) return dir;
      } catch {
        // malformed package.json — keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback: use cwd (will work if user IS at the root)
  return process.cwd();
}

/**
 * Asserts we can find a monorepo root and returns it.
 * Throws a structured error if we can only fall back to cwd and cwd doesn't
 * look like a monorepo root (no package.json at all).
 */
export async function requireMonorepoRoot(): Promise<string> {
  const root = await resolveMonorepoRoot();
  if (!(await pathExists(path.join(root, "package.json")))) {
    throw new MonorepoRootNotFoundError(process.cwd());
  }
  return root;
}

export class MonorepoRootNotFoundError extends Error {
  constructor(cwd: string) {
    super(
      `Could not find a monorepo root from: ${cwd}\n` +
      `Make sure you are inside an nx-factory-cli workspace, or run 'nx-factory-cli init' first.`,
    );
    this.name = "MonorepoRootNotFoundError";
  }
}
