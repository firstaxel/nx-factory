import path from "path";
import { pathExists, readJson, writeJson } from "./files.js";

export const CONFIG_FILENAME = "nx-factory.config.json";

export type PackageVisibility = "internal" | "public";

export interface NxShadcnConfig {
	workspaceName: string;
	scope: string;
	pkgManager: "pnpm" | "npm" | "yarn" | "bun";
	uiPackage: string;
	uiPackageVisibility: PackageVisibility;
	version: string;
}

/** Convert a workspace/repo name to a valid npm scope segment (without @). */
export function normalizeScope(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || "workspace"
	);
}

/** Resolve scope from config, with fallback for older configs. */
export function resolveScope(
	cfg: Pick<NxShadcnConfig, "scope" | "workspaceName"> | null | undefined,
): string {
	return normalizeScope(cfg?.scope ?? cfg?.workspaceName ?? "workspace");
}

export function scopedPackageName(scope: string, packageName: string): string {
	return `@${normalizeScope(scope)}/${packageName}`;
}

/** Find the config file walking up from cwd, or return null. */
export async function findConfig(
	startDir = process.cwd(),
): Promise<string | null> {
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
export async function saveConfig(
	cfg: NxShadcnConfig,
	rootDir = process.cwd(),
): Promise<void> {
	const file = path.join(rootDir, CONFIG_FILENAME);
	await writeJson(file, cfg);
}
