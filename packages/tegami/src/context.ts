import { join, resolve } from "node:path";
import { detect } from "package-manager-detector";
import type { TegamiOptions, TegamiPlugin, TegamiPluginOption } from "./types";
import { type NpmClient, NpmRegistryClient } from "./registry/npm";
import { discoverWorkspace, type PackageGraph } from "./workspace";
import type { RegistryClient } from "./registry";

export interface TegamiContext {
  cwd: string;
  changelogDir: string;
  planPath: string;
  options: TegamiOptions;
  plugins: TegamiPlugin[];
  graph: PackageGraph;
  registryClient: RegistryClient;
}

export async function createTegamiContext(options: TegamiOptions = {}): Promise<TegamiContext> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const npmClient = options.npmClient ?? (await resolveNpmClient(cwd));
  const graph = await discoverWorkspace(cwd);
  const registryClient = new NpmRegistryClient(cwd, npmClient, graph);
  const ctx: TegamiContext = {
    cwd,
    changelogDir: options.changelogDir ?? ".tegami",
    planPath: resolve(cwd, options.planPath ?? join(".tegami", "publish-plan.json")),
    options,
    plugins: resolvePlugins(options.plugins),
    graph,
    registryClient,
  };

  for (const plugin of ctx.plugins) {
    await plugin.init?.call(ctx);
  }

  return ctx;
}

async function resolveNpmClient(cwd: string): Promise<NpmClient> {
  const result = await detect({
    cwd,
  });

  if (result?.name === "pnpm") return "pnpm";
  return "npm";
}

const PLUGIN_ORDER = {
  pre: 0,
  default: 1,
  post: 2,
};

function resolvePlugins(plugins: TegamiPluginOption[] = []): TegamiPlugin[] {
  return (plugins as TegamiPlugin[])
    .flat(Infinity)
    .sort((a, b) => PLUGIN_ORDER[a.enforce ?? "default"] - PLUGIN_ORDER[b.enforce ?? "default"]);
}
