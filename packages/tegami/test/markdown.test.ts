import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { parseChangelogFile, readChangelogEntries } from "../src/markdown";

const tempDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");

  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("markdown changelog parsing", () => {
  test("parses yaml frontmatter and release headings", () => {
    const entries = parseChangelogFile(
      "/repo/.tegami/change.md",
      `---
subject: OpenAPI v11
packages: ["core", "ui"]
---

# Breaking export path

\`\`\`ts
import { ui } from "openapi";
\`\`\`

## Add proxy server

Some description.

### Fix path resolution

- Handles relative paths.

#### Notes

Ignored for release planning.
`,
    );

    expect(entries).toMatchObject([
      {
        file: "/repo/.tegami/change.md",
        subject: "OpenAPI v11",
        packages: ["core", "ui"],
        type: "major",
        title: "Breaking export path",
      },
      {
        type: "minor",
        title: "Add proxy server",
        content: "Some description.",
      },
      {
        type: "patch",
        title: "Fix path resolution",
      },
    ]);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.content).toContain('import { ui } from "openapi";');
    expect(entries[2]?.content).toContain("- Handles relative paths.");
  });

  test("returns an empty list when the changelog directory does not exist", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tegami-markdown-"));
    tempDirs.push(cwd);

    await expect(readChangelogEntries(cwd, ".tegami")).resolves.toEqual([]);
  });

  test("throws when frontmatter has invalid package data", () => {
    expect(() =>
      parseChangelogFile(
        "/repo/.tegami/change.md",
        `---
packages: core
---

### Invalid
`,
      ),
    ).toThrow();
  });

  test("parses empty crlf frontmatter", () => {
    const entries = parseChangelogFile(
      "/repo/.tegami/change.md",
      "---\r\n---\r\n\r\n### Patch release\r\n",
    );

    expect(entries).toMatchObject([
      {
        packages: [],
        title: "Patch release",
        type: "patch",
      },
    ]);
  });

  test("reads markdown files from the changelog directory in sorted order", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tegami-markdown-"));
    tempDirs.push(cwd);

    const changelogDir = join(cwd, ".tegami");
    await mkdir(changelogDir);
    await writeFile(
      join(changelogDir, "b.md"),
      `---
packages: ["core"]
---

### Second
`,
    );
    await writeFile(
      join(changelogDir, "a.md"),
      `---
packages: ["core"]
---

### First
`,
    );

    const entries = await readChangelogEntries(cwd, ".tegami");

    expect(entries.map((entry) => entry.title)).toEqual(["First", "Second"]);
  });
});
