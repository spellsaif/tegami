import { join, resolve } from "node:path";
import { detect } from "package-manager-detector";
import type { NpmClient, TegamiOptions } from "./types";
import { RegistryClient } from "./utils/registry";
import { discoverWorkspace, type PackageGraph } from "./workspace";
import { ChangelogEntry } from "./schemas";

export interface TegamiContext {
  cwd: string;
  changelogDir: string;
  planPath: string;
  options: TegamiOptions;
  npmClient: NpmClient;
  graph: PackageGraph;
  registryClient: RegistryClient;
}

export async function createTegamiContext(options: TegamiOptions = {}): Promise<TegamiContext> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const npmClient = options.npmClient ?? (await resolveNpmClient(cwd));
  const graph = await discoverWorkspace(cwd);
  const registryClient = new RegistryClient(cwd, npmClient, graph);

  return {
    cwd,
    changelogDir: options.changelogDir ?? ".tegami",
    planPath: resolve(cwd, options.planPath ?? join(".tegami", "publish-plan.json")),
    options,
    npmClient,
    graph,
    registryClient,
  };
}

export function filterChangelogsByIds(all: ChangelogEntry[], ids: Set<string>): ChangelogEntry[] {
  return all.filter((entry) => ids.has(entry.id));
}

async function resolveNpmClient(cwd: string): Promise<NpmClient> {
  const result = await detect({
    cwd,
  });

  if (result?.name === "pnpm") return "pnpm";
  return "npm";
}
