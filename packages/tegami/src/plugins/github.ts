import { x } from "tinyexec";
import type { PackagePublishResult } from "../publish";
import type { Awaitable, TegamiPlugin } from "../types";
import { git, type GitPluginOptions } from "./git";

interface GithubRelease {
  /** Release title */
  title?: string;
  /** Release notes */
  notes?: string;
  /** Whether to mark release as prerelease */
  prerelease?: boolean;
}

/** Options for creating GitHub releases after a successful publish. */
export interface GitHubPluginOptions extends GitPluginOptions {
  /** GitHub repository. */
  repo?: string;

  /** override release details, return `false` to skip */
  onCreateRelease?: (result: PackagePublishResult) => Awaitable<GithubRelease | false>;
}

/** Create GitHub releases for successfully published packages after the whole plan succeeds. */
export function github(options: GitHubPluginOptions = {}): TegamiPlugin[] {
  async function createGithubRelease(pkg: PackagePublishResult): Promise<void> {
    if (!pkg.gitTag) return;
    const release = (await options.onCreateRelease?.(pkg)) ?? {};
    if (release === false) return;

    const args: string[] = [
      "release",
      "create",
      pkg.gitTag,
      "--title",
      release.title ?? `${pkg.name}@${pkg.version}`,
      "--notes",
      release.notes ?? defaultNotes(pkg),
    ];

    if (options.repo) {
      args.push("--repo", options.repo);
    }

    if (release.prerelease) {
      args.push("--prerelease");
    }

    await x("gh", args, {
      throwOnError: true,
    });
  }

  return [
    git(options),
    {
      name: "github",
      async afterPublish(result) {
        if (result.state !== "success") return;

        await Promise.all(result.packages.map(createGithubRelease));
      },
    },
  ];
}

function defaultNotes(pkg: PackagePublishResult): string {
  const entries = pkg.changelogs;
  if (entries.length > 0) {
    return entries
      .map((entry) => [`### ${entry.title}`, entry.content].filter(Boolean).join("\n\n"))
      .join("\n\n");
  }

  return [`Published ${pkg.name}@${pkg.version}.`, "", `npm dist-tag: ${pkg.distTag}`].join("\n");
}
