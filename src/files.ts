import fs from "fs-extra";
import path from "path";

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, data, { spaces: 2 });
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

export async function pathExists(p: string): Promise<boolean> {
  return fs.pathExists(p);
}

export async function ensureDir(p: string): Promise<void> {
  await fs.ensureDir(p);
}

export async function readJson<T = unknown>(filePath: string): Promise<T> {
  return fs.readJson(filePath) as Promise<T>;
}

export async function appendToFile(filePath: string, content: string): Promise<void> {
  await fs.appendFile(filePath, content, "utf-8");
}
