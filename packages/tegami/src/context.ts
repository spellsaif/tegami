import { join, resolve } from "node:path";
import { detect } from "package-manager-detector";
import type { PublishOptions } from "./publish";
import type { TegamiOptions } from "./types";
import type { NpmClient } from "./utils/npm";
import { RegistryClient, type PackageRegistryClient } from "./utils/registry";

export interface TegamiContext {
  cwd: string;
  changelogDir: string;
  planPath: string;
  options: TegamiOptions;
  publish: Required<Pick<PublishOptions, "dryRun">> & PublishOptions;
  npmClient: NpmClient;
  registryClient: PackageRegistryClient;
}

export async function createTegamiContext(options: TegamiOptions = {}): Promise<TegamiContext> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const publish = {
    ...options.publish,
    dryRun: options.publish?.dryRun ?? false,
  };
  const npmClient = await resolveNpmClient(cwd, publish.npmClient);
  const registryClient = new RegistryClient({
    npmClient,
  });

  return {
    cwd,
    changelogDir: options.changelogDir ?? ".tegami",
    planPath: resolve(cwd, options.planPath ?? join(".tegami", "publish-plan.json")),
    options,
    publish,
    npmClient,
    registryClient,
  };
}

async function resolveNpmClient(cwd: string, npmClient: NpmClient | undefined): Promise<NpmClient> {
  if (npmClient) return npmClient;

  const result = await detect({
    cwd,
  });

  if (result?.name === "pnpm") return "pnpm";
  return "npm";
}
