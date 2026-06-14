import type { TegamiContext } from "./context";
import type { DraftPlan, PackageOptions } from "./draft";
import type { ChangelogEntry } from "./markdown";
import type { PublishOptions, PublishResult } from "./publish";
import type { NpmClient } from "./registry/npm";

/** Generates changelog content for a package release. */
export interface LogGenerator {
  generate(
    this: TegamiContext,
    opts: {
      packageName: string;
      version: string;
      changelogs: ChangelogEntry[];
    },
  ): string | Promise<string>;
}

export interface TegamiOptions {
  /** Workspace root. Defaults to the current working directory. */
  cwd?: string;
  /** Directory containing pending changelog markdown files. */
  changelogDir?: string;
  /** Path to the publish plan file. */
  planPath?: string;
  /** Changelog generator used when creating a publish plan. */
  generator?: LogGenerator;
  /** Per-package release and publish options keyed by package name. */
  packages?: Record<string, PackageOptions>;
  plugins?: TegamiPluginOption[];

  /** Package manager command used for npm registry operations. */
  npmClient?: NpmClient;
}

export type TegamiPluginOption = TegamiPlugin | TegamiPluginOption[];

export interface TegamiPlugin {
  name: string;
  enforce?: "pre" | "default" | "post";
  /** when Tegami initializes */
  init?(this: TegamiContext): Awaitable<void>;
  /** Called after Tegami builds the initial draft plan and before it is returned. */
  initPlan?(this: TegamiContext, plan: DraftPlan): Awaitable<DraftPlan | void | undefined>;
  /** Called after publishing finishes. */
  afterPublish?(
    this: TegamiContext & { publishOptions: PublishOptions },
    result: PublishResult,
  ): Awaitable<PublishResult | void | undefined>;
}

export type Awaitable<T> = T | Promise<T>;
