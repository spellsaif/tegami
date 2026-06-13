import { readFile, writeFile } from "node:fs/promises";
import { basename, join, normalize } from "node:path";
import { load } from "js-yaml";
import { glob } from "tinyglobby";
import { z } from "zod";
import { packageManifestSchema, type PackageManifestData } from "./schemas";
import { isNodeError } from "./utils/error";

/** Package discovered in the workspace. */
export interface WorkspacePackage {
  name: string;
  path: string;
  version: string;
  private: boolean;
  manifest: PackageManifest;
}

export type PackageManifest = PackageManifestData;

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const pnpmWorkspaceSchema = z.object({
  packages: z.array(z.string()).default(["."]),
});

/** Dependency graph for discovered workspace packages. */
export class PackageGraph {
  readonly packages: WorkspacePackage[];
  readonly byName: Map<string, WorkspacePackage>;

  constructor(packages: WorkspacePackage[]) {
    this.packages = packages;
    this.byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  }

  /** Get a package by exact name or common local alias. */
  get(name: string): WorkspacePackage | undefined {
    return this.byName.get(name) ?? this.findByAlias(name);
  }

  /** Internal workspace packages that the package depends on. */
  internalDependencies(pkg: WorkspacePackage): WorkspacePackage[] {
    const dependencies = new Set<WorkspacePackage>();

    for (const field of dependencyFields) {
      const records = pkg.manifest[field];
      if (!records) continue;

      for (const name of Object.keys(records)) {
        const dependency = this.byName.get(name);
        if (dependency) dependencies.add(dependency);
      }
    }

    return Array.from(dependencies);
  }

  /** Workspace packages that depend on the package. */
  dependents(pkg: WorkspacePackage): WorkspacePackage[] {
    return this.packages.filter((candidate) =>
      this.internalDependencies(candidate).some((dependency) => dependency.name === pkg.name),
    );
  }

  private findByAlias(name: string): WorkspacePackage | undefined {
    return this.packages.find((pkg) => {
      const unscopedName = pkg.name.includes("/") ? pkg.name.split("/").at(-1) : pkg.name;
      return unscopedName === name || basename(pkg.path) === name;
    });
  }
}

/** Discover workspace packages from pnpm-workspace.yaml or package.json workspaces. */
export async function discoverWorkspace(cwd: string): Promise<PackageGraph> {
  const patterns = await readWorkspacePatterns(cwd);
  const packages: WorkspacePackage[] = [];
  const packagePaths = await expandWorkspacePatterns(cwd, patterns);

  for (const packagePath of packagePaths) {
    const manifest = await readManifest(packagePath);
    if (!manifest.name || !manifest.version) continue;

    packages.push({
      name: manifest.name,
      path: packagePath,
      version: manifest.version,
      private: manifest.private === true,
      manifest,
    });
  }

  const rootManifest = await readManifest(cwd).catch(() => undefined);
  if (rootManifest?.name && rootManifest.version && rootManifest.private !== true) {
    packages.unshift({
      name: rootManifest.name,
      path: cwd,
      version: rootManifest.version,
      private: false,
      manifest: rootManifest,
    });
  }

  return new PackageGraph(dedupePackages(packages));
}

/** Write a package manifest back to disk. */
export async function writeManifest(
  pkg: WorkspacePackage,
  manifest: PackageManifest,
): Promise<void> {
  const path = join(pkg.path, "package.json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readWorkspacePatterns(cwd: string): Promise<string[]> {
  const pnpmPatterns = await readFile(join(cwd, "pnpm-workspace.yaml"), "utf8")
    .then((content) => pnpmWorkspaceSchema.parse(load(content) ?? {}).packages)
    .catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    });

  if (pnpmPatterns) {
    return pnpmPatterns;
  }

  const rootManifest = await readManifest(cwd);
  return rootManifest.workspaces ?? ["."];
}

async function expandWorkspacePatterns(cwd: string, patterns: string[]): Promise<string[]> {
  const packagePaths = patterns.includes(".") ? [cwd] : [];
  const globPatterns = patterns.filter((pattern) => pattern !== ".");

  if (globPatterns.length === 0) {
    return filterPackageDirectories(packagePaths);
  }

  const globPaths = await glob(globPatterns, {
    absolute: true,
    cwd,
    ignore: ["**/node_modules/**"],
    onlyDirectories: true,
    onlyFiles: false,
  });

  return filterPackageDirectories([...packagePaths, ...globPaths]);
}

async function filterPackageDirectories(paths: string[]): Promise<string[]> {
  const packagePaths = await Promise.all(
    paths.map(async (path) => {
      return readManifest(path)
        .then(() => path)
        .catch(() => undefined);
    }),
  );

  return packagePaths.filter((path): path is string => Boolean(path)).map(normalizePackagePath);
}

function normalizePackagePath(path: string): string {
  const normalized = normalize(path);
  return normalized.length > 1 ? normalized.replace(/[\\/]+$/, "") : normalized;
}

async function readManifest(packagePath: string): Promise<PackageManifest> {
  const content = await readFile(join(packagePath, "package.json"), "utf8");
  return packageManifestSchema.parse(JSON.parse(content));
}

function dedupePackages(packages: WorkspacePackage[]): WorkspacePackage[] {
  const seen = new Set<string>();
  const deduped: WorkspacePackage[] = [];

  for (const pkg of packages) {
    if (seen.has(pkg.name)) continue;
    seen.add(pkg.name);
    deduped.push(pkg);
  }

  return deduped;
}
