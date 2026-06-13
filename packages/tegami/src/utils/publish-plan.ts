import { z } from "zod";
import type { PackageRelease } from "../draft";
import type { ChangelogEntry } from "../markdown";

const changelogEntrySchema = z.object({
  file: z.string(),
  subject: z.string().optional(),
  packages: z.array(z.string()),
  type: z.enum(["major", "minor", "patch"]),
  title: z.string(),
  content: z.string(),
});

const packageReleaseReasonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("changelog"),
    file: z.string(),
  }),
  z.object({
    type: z.literal("dependency"),
    package: z.string(),
  }),
]);

const storedPackageReleaseSchema = z.object({
  name: z.string(),
  path: z.string(),
  oldVersion: z.string(),
  version: z.string(),
  type: z.enum(["major", "minor", "patch"]),
  reasons: z.array(packageReleaseReasonSchema),
  distTag: z.string(),
  access: z.enum(["public", "restricted"]).optional(),
  private: z.boolean(),
  gitTag: z.union([z.string(), z.literal(false)]),
  publish: z.boolean(),
});

const storedPublishPlanSchema = z
  .object({
    id: z.string(),
    createdAt: z.string(),
    changelogs: z.array(changelogEntrySchema),
    packages: z.array(storedPackageReleaseSchema),
  })
  .superRefine((plan, context) => {
    const seen = new Set<string>();

    for (const [index, pkg] of plan.packages.entries()) {
      if (!seen.has(pkg.name)) {
        seen.add(pkg.name);
        continue;
      }

      context.addIssue({
        code: "custom",
        message: `Duplicate package in publish plan: ${pkg.name}`,
        path: ["packages", index, "name"],
      });
    }
  });

export interface PublishPlan {
  id: string;
  createdAt: string;
  changelogs: ChangelogEntry[];
  packages: PackageRelease[];
}

export function parsePublishPlan(content: string): PublishPlan {
  const plan = storedPublishPlanSchema.parse(JSON.parse(content));
  return {
    ...plan,
    packages: plan.packages.map((pkg) => {
      const files = new Set<string>();
      for (const reason of pkg.reasons) {
        if (reason.type === "changelog") files.add(reason.file);
      }

      return {
        ...pkg,
        changelogs: plan.changelogs.filter((entry) => files.has(entry.file)),
      };
    }),
  };
}

export function serializePublishPlan(plan: PublishPlan): string {
  const storedPlan = storedPublishPlanSchema.parse({
    id: plan.id,
    createdAt: plan.createdAt,
    changelogs: plan.changelogs,
    packages: plan.packages.map(({ changelogs: _changelogs, ...pkg }) => pkg),
  });

  return JSON.stringify(storedPlan, null, 2);
}
