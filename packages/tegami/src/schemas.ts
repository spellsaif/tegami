import { z } from "zod";

export const changelogFrontmatterSchema = z.object({
  subject: z.string().optional(),
  packages: z.array(z.string()).default([]),
});

export type ChangelogFrontmatter = z.infer<typeof changelogFrontmatterSchema>;

const stringRecordSchema = z.record(z.string(), z.string());

export const workspacePatternsSchema = z
  .union([
    z.array(z.string()),
    z
      .looseObject({
        packages: z.array(z.string()).optional(),
      })
      .transform((workspaces) => workspaces.packages ?? ["."]),
  ])
  .pipe(z.array(z.string()));

export const packageManifestSchema = z.looseObject({
  name: z.string().optional(),
  version: z.string().optional(),
  private: z.boolean().optional(),
  publishConfig: z
    .looseObject({
      access: z.enum(["public", "restricted"]).optional(),
      registry: z.string().optional(),
    })
    .optional(),
  workspaces: workspacePatternsSchema.optional(),
  dependencies: stringRecordSchema.optional(),
  devDependencies: stringRecordSchema.optional(),
  peerDependencies: stringRecordSchema.optional(),
  optionalDependencies: stringRecordSchema.optional(),
});

export type PackageManifestData = z.infer<typeof packageManifestSchema>;
