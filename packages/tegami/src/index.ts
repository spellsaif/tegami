import { readFile } from "node:fs/promises";
import { createTegamiContext } from "./context";
import { DraftPlan, createDraftPlanData } from "./draft";
import { readChangelogEntries } from "./markdown";
import { publishFromPlan } from "./publish";
import type { PublishResult } from "./publish";
import type { TegamiOptions } from "./types";
import { isNodeError } from "./utils/error";
import { parsePublishPlan } from "./utils/publish-plan";
import { PackageGraph, discoverWorkspace } from "./workspace";

export type { ChangelogEntry } from "./markdown";
export type {
  AddPackageOptions,
  DraftPlanData,
  PackageOptions,
  PackageRelease,
  PackageReleaseReason,
} from "./draft";
export type { PublishPlan } from "./utils/publish-plan";
export type {
  PackagePublishResult as PublishedPackage,
  PublishOptions,
  PublishResult,
} from "./publish";
export type { LogGenerator, TegamiOptions, TegamiPlugin } from "./types";
export type { PackageManifest, WorkspacePackage } from "./workspace";
export { DraftPlan } from "./draft";
export { PackageGraph } from "./workspace";

export interface Tegami {
  /** Build an editable draft from pending changelog files. */
  draft(): Promise<DraftPlan>;
  /** Discover workspace packages and their dependency relationships. */
  graph(): Promise<PackageGraph>;
  /** Publish the current publish plan. */
  publish(): Promise<PublishResult>;
}

/** Create a Tegami project handle. */
export function tegami(options: TegamiOptions = {}): Tegami {
  const context = createTegamiContext(options);

  return {
    async draft() {
      const resolvedContext = await context;
      const graph = await discoverWorkspace(resolvedContext.cwd);
      const changelogs = await readChangelogEntries(
        resolvedContext.cwd,
        resolvedContext.changelogDir,
      );
      const data = createDraftPlanData(changelogs, graph, resolvedContext);

      for (const plugin of options.plugins ?? []) {
        await plugin.initPlan?.(data);
      }

      return new DraftPlan(data, graph, resolvedContext);
    },

    async graph() {
      const resolvedContext = await context;
      return discoverWorkspace(resolvedContext.cwd);
    },

    async publish() {
      const resolvedContext = await context;
      const content = await readFile(resolvedContext.planPath, "utf8").catch((error: unknown) => {
        if (isNodeError(error) && error.code === "ENOENT") return undefined;
        throw error;
      });

      if (content === undefined) {
        throw new Error(`No publish plan found at ${resolvedContext.planPath}.`);
      }

      const result = await publishFromPlan(resolvedContext, parsePublishPlan(content));

      for (const plugin of options.plugins ?? []) {
        await plugin.afterPublish?.(result);
      }

      return result;
    },
  };
}
