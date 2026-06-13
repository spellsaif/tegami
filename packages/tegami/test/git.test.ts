import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { x } from "tinyexec";
import { afterEach, describe, expect, test } from "vitest";
import { createGitTag, gitTagExists } from "../src/utils/git";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("git utils", () => {
  test("skips tags that already exist", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tegami-git-"));
    tempDirs.push(cwd);

    await x("git", ["init"], { nodeOptions: { cwd }, throwOnError: true });
    await writeFile(join(cwd, "README.md"), "# Test\n");
    await x("git", ["add", "README.md"], { nodeOptions: { cwd }, throwOnError: true });
    await x(
      "git",
      ["-c", "user.name=Tegami", "-c", "user.email=tegami@example.com", "commit", "-m", "init"],
      {
        nodeOptions: { cwd },
        throwOnError: true,
      },
    );
    await x("git", ["tag", "pkg@1.0.0"], { nodeOptions: { cwd }, throwOnError: true });

    await expect(createGitTag(cwd, "pkg@1.0.0")).resolves.toBeUndefined();
    await expect(createGitTag(cwd, "pkg@1.0.1")).resolves.toBeUndefined();
    await expect(gitTagExists(cwd, "pkg@1.0.1")).resolves.toBe(true);
  });
});
