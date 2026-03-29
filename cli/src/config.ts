import path from "path";
import { pathExists, readJson, writeJson } from "./files.js";

export const CONFIG_FILENAME = "nx-factory.config.json";

export interface NxShadcnConfig {
  workspaceName: string;
  pkgManager:    "pnpm" | "npm" | "yarn" | "bun";
  uiPackage:     string;   // e.g. "ui" → lives at packages/ui
  version:       string;   // CLI version that wrote this config
}

/** Find the config file walking up from cwd, or return null. */
export async function findConfig(startDir = process.cwd()): Promise<string | null> {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (await pathExists(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Load config from the nearest nx-factory.config.json, or return null. */
export async function loadConfig(): Promise<NxShadcnConfig | null> {
  const file = await findConfig();
  if (!file) return null;
  try {
    return await readJson<NxShadcnConfig>(file);
  } catch {
    return null;
  }
}

/** Write config to <rootDir>/nx-factory.config.json. */
export async function saveConfig(cfg: NxShadcnConfig, rootDir = process.cwd()): Promise<void> {
  const file = path.join(rootDir, CONFIG_FILENAME);
  await writeJson(file, cfg);
}
