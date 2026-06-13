import type { TegamiContext } from "./context";
import type { ChangelogEntry } from "./markdown";
import { createGitTag } from "./utils/git";
import { readPublishRegistry, validateManifestVersion } from "./utils/manifest";
import { publishPackage, type NpmClient } from "./utils/npm";
import type { PublishPlan } from "./utils/publish-plan";
import { formatRegistry } from "./utils/registry";

export interface PublishOptions {
  /** Validate the publish plan without publishing packages, creating tags, or running release plugins. */
  dryRun?: boolean;
  /** Package manager command used for npm registry operations. */
  npmClient?: NpmClient;
  /** Set to false to skip creating git tags after all packages publish successfully. */
  gitTags?: boolean;
}

export interface PublishResult {
  /** Path to the publish plan that was executed. */
  planPath: string;
  state: "success" | "failed";
  packages: PackagePublishResult[];
}

export interface PackagePublishResult {
  name: string;
  path: string;
  version: string;
  distTag: string;
  /** Changelog entries persisted in the publish plan. */
  changelogs: ChangelogEntry[];
  gitTag: string | false;
  state: "success" | "failed";
  reason?: string;
  error?: string;
}

export async function publishFromPlan(
  context: TegamiContext,
  plan: PublishPlan,
): Promise<PublishResult> {
  const packages = await publishStoredPlan(plan, context);
  await createGitTags(plan, context, packages);

  return {
    planPath: context.planPath,
    state: packages.some((pkg) => pkg.state === "failed") ? "failed" : "success",
    packages,
  };
}

async function publishStoredPlan(
  plan: PublishPlan,
  context: TegamiContext,
): Promise<PackagePublishResult[]> {
  const results: PackagePublishResult[] = [];

  for (const pkg of plan.packages) {
    if (!pkg.publish) continue;

    if (!context.publish.dryRun) {
      const registry = await readPublishRegistry(pkg.path);
      const published = await context.registryClient.packageVersionExists(pkg.name, pkg.version, {
        cwd: pkg.path,
        registry,
      });

      if (published) {
        results.push({
          name: pkg.name,
          path: pkg.path,
          version: pkg.version,
          distTag: pkg.distTag,
          changelogs: pkg.changelogs,
          gitTag: pkg.gitTag,
          state: "success",
          reason: `Version already exists in the npm registry${formatRegistry(registry)}.`,
        });
        continue;
      }
    }

    try {
      await validateManifestVersion(pkg.path, pkg.name, pkg.version);

      if (!context.publish.dryRun) {
        await publishPackage(pkg.path, pkg.distTag, pkg.access, context.npmClient);
      }

      results.push({
        name: pkg.name,
        path: pkg.path,
        version: pkg.version,
        distTag: pkg.distTag,
        changelogs: pkg.changelogs,
        gitTag: pkg.gitTag,
        state: "success",
        reason: "Dry run.",
      });
    } catch (error) {
      results.push({
        name: pkg.name,
        path: pkg.path,
        version: pkg.version,
        distTag: pkg.distTag,
        changelogs: pkg.changelogs,
        gitTag: pkg.gitTag,
        state: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function createGitTags(
  plan: PublishPlan,
  context: TegamiContext,
  results: PackagePublishResult[],
): Promise<void> {
  if (context.publish.dryRun || context.publish.gitTags === false) return;
  if (results.some((pkg) => pkg.state === "failed")) return;

  for (const pkg of plan.packages) {
    if (!pkg.publish || !pkg.gitTag) continue;

    try {
      await createGitTag(pkg.path, pkg.gitTag);
    } catch (error) {
      const result = results.find((item) => item.name === pkg.name);
      if (!result) throw error;

      result.state = "failed";
      result.error = error instanceof Error ? error.message : String(error);
      return;
    }
  }
}

