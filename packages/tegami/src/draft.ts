import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TegamiContext } from "./context";
import { simpleGenerator } from "./generators/simple";
import type { ChangelogEntry } from "./markdown";
import { parsePublishPlan, serializePublishPlan, type PublishPlan } from "./utils/publish-plan";
import type { BumpType } from "./utils/semver";
import { bumpVersion, inferBumpType, maxBump, updateRange } from "./utils/semver";
import { PackageGraph, type WorkspacePackage, writeManifest } from "./workspace";

/** Per-package options applied when creating publish plans. */
export interface PackageOptions {
  /** npm dist-tag used when publishing. */
  distTag?: string;
  /** npm package access passed to publish. */
  access?: "public" | "restricted";
  /** Set to false to keep this package out of npm publishing. */
  publish?: boolean;
  /** Custom git tag, or false to skip git tag creation for this package. */
  gitTag?: string | false;
}

/** Package release planned by Tegami. */
export interface PackageRelease {
  name: string;
  path: string;
  oldVersion: string;
  version: string;
  type: BumpType;
  reasons: PackageReleaseReason[];
  changelogs: ChangelogEntry[];
  distTag: string;
  access?: "public" | "restricted";
  private: boolean;
  gitTag: string | false;
  publish: boolean;
}

/** Options for manually adding a package to a draft. */
export interface AddPackageOptions {
  name: string;
  version: string;
  reasons: PackageReleaseReason[];
}

export type PackageReleaseReason = ChangelogReleaseReason | DependencyReleaseReason;

export interface ChangelogReleaseReason {
  type: "changelog";
  file: string;
}

export interface DependencyReleaseReason {
  type: "dependency";
  package: string;
}

/** Mutable data passed to plugins before a draft is returned. */
export interface DraftPlanData {
  changelogs: ChangelogEntry[];
  packages: PackageRelease[];
}

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export class DraftPlan {
  readonly changelogs: ChangelogEntry[];
  readonly packages: PackageRelease[];

  #created = false;
  #context: TegamiContext;
  #graph: PackageGraph;

  constructor(data: DraftPlanData, graph: PackageGraph, context: TegamiContext) {
    this.changelogs = data.changelogs;
    this.packages = data.packages;
    this.#graph = graph;
    this.#context = context;
  }

  /** Add a package release manually before creating the publish plan. */
  addPackage(release: AddPackageOptions): void {
    this.assertEditable();

    const existing = this.packages.find((pkg) => pkg.name === release.name);
    if (existing) {
      throw new Error(`Package "${release.name}" is already in the draft.`);
    }

    const pkg = this.#graph.get(release.name);
    if (!pkg) {
      throw new Error(`Cannot add unknown package "${release.name}".`);
    }

    this.packages.push(createManualPackageRelease(pkg, release, this.#context));
  }

  /** Write the publish plan, update package versions, and consume changelog files. */
  async createPublishPlan(): Promise<PublishPlan> {
    this.assertEditable();
    await this.assertPublishPlanFinished();

    this.#created = true;

    await this.applyVersionChanges();

    const plan: PublishPlan = {
      id: `tegami-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      changelogs: this.changelogs,
      packages: this.packages,
    };

    await mkdir(dirname(this.#context.planPath), { recursive: true });
    await writeFile(this.#context.planPath, serializePublishPlan(plan));
    await this.removeConsumedChangelogs();
    return plan;
  }

  private async assertPublishPlanFinished(): Promise<void> {
    const content = await readFile(this.#context.planPath, "utf8").catch(() => undefined);
    if (!content) return;

    const status = await this.#context.registryClient.publishPlanStatus(parsePublishPlan(content));
    if (status.state === "success") return;

    const message = `Publish plan already exists at ${this.#context.planPath} and is ${status.state}. Publish it before creating a new plan.`;
    throw new Error(status.error ? `${message}\n${status.error}` : message);
  }

  private async applyVersionChanges(): Promise<void> {
    const releasesByName = new Map(this.packages.map((release) => [release.name, release]));

    // TODO: Add dependent package bumps and dependency reasons when an internal dependency
    // changes outside a dependent's accepted semver range.
    for (const release of this.packages) {
      const pkg = this.#graph.get(release.name);
      if (!pkg) continue;

      const manifest = structuredClone(pkg.manifest);
      manifest.version = release.version;

      for (const field of dependencyFields) {
        const dependencies = manifest[field];
        if (!dependencies) continue;

        for (const [name, range] of Object.entries(dependencies)) {
          const dependencyRelease = releasesByName.get(name);
          if (!dependencyRelease) continue;

          dependencies[name] = updateRange(range, dependencyRelease.version);
        }
      }

      await writeManifest(pkg, manifest);
      await appendChangelog(pkg, release, this.#context);
    }
  }

  private async removeConsumedChangelogs() {
    const files = new Set(this.changelogs.map((entry) => entry.file));

    for (const file of files) {
      await rm(file, { force: true });
    }
  }

  private assertEditable(): void {
    if (this.#created) {
      throw new Error("This draft has already created a publish plan.");
    }
  }
}

export function createDraftPlanData(
  changelogs: ChangelogEntry[],
  graph: PackageGraph,
  context: TegamiContext,
): DraftPlanData {
  const byPackage = new Map<string, ChangelogEntry[]>();

  for (const entry of changelogs) {
    for (const requestedPackage of entry.packages) {
      const pkg = graph.get(requestedPackage);
      if (!pkg) continue;

      const entries = byPackage.get(pkg.name) ?? [];
      entries.push(entry);
      byPackage.set(pkg.name, entries);
    }
  }

  const packages: PackageRelease[] = [];
  for (const [name, entries] of byPackage.entries()) {
    const pkg = graph.get(name);
    if (!pkg) continue;

    packages.push(createPackageRelease(pkg, entries, context));
  }

  return { changelogs, packages };
}

function createPackageRelease(
  pkg: WorkspacePackage,
  entries: ChangelogEntry[],
  context: TegamiContext,
): PackageRelease {
  const packageOptions = context.options.packages?.[pkg.name] ?? {};
  const type = entries.reduce(
    (current, entry) => maxBump(current, entry.type),
    "patch" as PackageRelease["type"],
  );
  const version = entries.length > 0 ? bumpVersion(pkg.version, type) : pkg.version;
  const access = packageOptions.access ?? pkg.manifest.publishConfig?.access;
  const distTag = packageOptions.distTag ?? "latest";
  const gitTag =
    packageOptions.gitTag === false ? false : (packageOptions.gitTag ?? `${pkg.name}@${version}`);

  return {
    name: pkg.name,
    path: pkg.path,
    oldVersion: pkg.version,
    version,
    type,
    reasons: entries.map((entry) => ({
      type: "changelog",
      file: entry.file,
    })),
    changelogs: entries,
    distTag,
    access,
    private: pkg.private,
    gitTag,
    publish: packageOptions.publish ?? !pkg.private,
  };
}

function createManualPackageRelease(
  pkg: WorkspacePackage,
  release: AddPackageOptions,
  context: TegamiContext,
): PackageRelease {
  const packageOptions = context.options.packages?.[pkg.name] ?? {};
  const access = packageOptions.access ?? pkg.manifest.publishConfig?.access;
  const gitTag =
    packageOptions.gitTag === false
      ? false
      : (packageOptions.gitTag ?? `${pkg.name}@${release.version}`);

  return {
    name: pkg.name,
    path: pkg.path,
    oldVersion: pkg.version,
    version: release.version,
    type: inferBumpType(pkg.version, release.version),
    reasons: release.reasons,
    changelogs: [],
    distTag: packageOptions.distTag ?? "latest",
    access,
    private: pkg.private,
    gitTag,
    publish: packageOptions.publish ?? !pkg.private,
  };
}

async function appendChangelog(
  pkg: WorkspacePackage,
  release: PackageRelease,
  context: TegamiContext,
): Promise<void> {
  if (release.changelogs.length === 0) return;

  const generator = context.options.generator ?? simpleGenerator();
  const generated = await generator.generate(release);
  const path = join(pkg.path, "CHANGELOG.md");
  const existing = await readFile(path, "utf8").catch(() => "");

  await writeFile(path, `${generated.trim()}\n\n${existing}`.trimEnd() + "\n");
}
