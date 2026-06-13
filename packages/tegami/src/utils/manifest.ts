import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { packageManifestSchema } from "../schemas";

export async function readPublishRegistry(packagePath: string): Promise<string | undefined> {
  const manifest = await readPackageManifest(packagePath);
  const registry = manifest.publishConfig?.registry;

  return registry && registry.length > 0 ? registry : undefined;
}

export async function validateManifestVersion(
  packagePath: string,
  name: string,
  version: string,
): Promise<void> {
  const manifest = await readPackageManifest(packagePath);

  if (manifest.name !== name) {
    throw new Error(`Expected package ${name}, found ${manifest.name ?? "unknown"}.`);
  }

  if (manifest.version !== version) {
    throw new Error(`Expected ${name}@${version}, found ${manifest.version ?? "unknown"}.`);
  }
}

async function readPackageManifest(packagePath: string) {
  const content = await readFile(join(packagePath, "package.json"), "utf8");
  return packageManifestSchema.parse(JSON.parse(content));
}
