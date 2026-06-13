import { x } from "tinyexec";
import { readPublishRegistry } from "./manifest";
import type { NpmClient } from "./npm";
import type { PublishPlan } from "./publish-plan";

export interface RegistryClientOptions {
  npmClient?: NpmClient;
}

export interface RegistryQueryOptions {
  cwd?: string;
  registry?: string;
}

export interface PackageRegistryClient {
  packageExists(name: string, options?: RegistryQueryOptions): Promise<boolean>;
  packageVersion(
    name: string,
    version: string,
    options?: RegistryQueryOptions,
  ): Promise<string | undefined>;
  packageVersionExists(
    name: string,
    version: string,
    options?: RegistryQueryOptions,
  ): Promise<boolean>;
  publishPlanStatus(
    plan: PublishPlan,
  ): Promise<{ state: "pending" | "success" | "failed"; error?: string }>;
}

export class RegistryClient implements PackageRegistryClient {
  #npmClient: NpmClient;
  #versionCache = new Map<string, Promise<string | undefined>>();
  #packageCache = new Map<string, Promise<boolean>>();

  constructor(options: RegistryClientOptions = {}) {
    this.#npmClient = options.npmClient ?? "npm";
  }

  async packageExists(name: string, options: RegistryQueryOptions = {}): Promise<boolean> {
    const key = JSON.stringify([options.cwd, options.registry, name]);
    const existing = this.#packageCache.get(key);

    if (existing) return existing;

    const request = this.queryPackageExists(name, options).catch((error: unknown) => {
      this.#packageCache.delete(key);
      throw error;
    });
    this.#packageCache.set(key, request);

    return request;
  }

  async packageVersion(
    name: string,
    version: string,
    options: RegistryQueryOptions = {},
  ): Promise<string | undefined> {
    const key = JSON.stringify([options.cwd, options.registry, name, version]);
    const existing = this.#versionCache.get(key);

    if (existing) return existing;

    const request = this.queryPackageVersion(name, version, options).catch((error: unknown) => {
      this.#versionCache.delete(key);
      throw error;
    });
    this.#versionCache.set(key, request);

    return request;
  }

  async packageVersionExists(
    name: string,
    version: string,
    options: RegistryQueryOptions = {},
  ): Promise<boolean> {
    return (await this.packageVersion(name, version, options)) !== undefined;
  }

  async publishPlanStatus(
    plan: PublishPlan,
  ): Promise<{ state: "pending" | "success" | "failed"; error?: string }> {
    for (const pkg of plan.packages) {
      if (!pkg.publish) continue;

      try {
        const registry = await readPublishRegistry(pkg.path);
        const exists = await this.packageVersionExists(pkg.name, pkg.version, {
          cwd: pkg.path,
          registry,
        });

        if (!exists) return { state: "pending" };
      } catch (error) {
        return {
          state: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { state: "success" };
  }

  clearCache(): void {
    this.#versionCache.clear();
    this.#packageCache.clear();
  }

  private async queryPackageExists(name: string, options: RegistryQueryOptions): Promise<boolean> {
    const result = await this.npmView([name, "name", "--json"], options);

    if (result.exitCode === 0) return true;

    const output = commandOutput(result);
    if (isMissingRegistryEntry(output)) return false;

    throw new Error(
      `Unable to validate ${name} against the npm registry${formatRegistry(options.registry)}: ${
        output.trim() || `command exited with code ${result.exitCode}`
      }`,
    );
  }

  private async queryPackageVersion(
    name: string,
    version: string,
    options: RegistryQueryOptions,
  ): Promise<string | undefined> {
    const result = await this.npmView([`${name}@${version}`, "version", "--json"], options);

    if (result.exitCode === 0) {
      return version;
    }

    const output = commandOutput(result);
    if (isMissingRegistryEntry(output)) return undefined;

    throw new Error(
      `Unable to validate ${name}@${version} against the npm registry${formatRegistry(
        options.registry,
      )}: ${output.trim() || `command exited with code ${result.exitCode}`}`,
    );
  }

  private async npmView(args: string[], options: RegistryQueryOptions) {
    if (options.registry) {
      args.push("--registry", options.registry);
    }
    return x(this.#npmClient, ["view", ...args], {
      nodeOptions: {
        cwd: options.cwd,
      },
    });
  }
}

function commandOutput(result: Awaited<ReturnType<typeof x>>): string {
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

function isMissingRegistryEntry(output: string): boolean {
  const normalized = output.toLowerCase();

  return (
    normalized.includes("e404") ||
    normalized.includes("404") ||
    normalized.includes("no match") ||
    normalized.includes("no matching version") ||
    normalized.includes("not found")
  );
}

export function formatRegistry(registry: string | undefined): string {
  return registry ? ` (${registry})` : "";
}
