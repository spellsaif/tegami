import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { x } from "tinyexec";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PublishPlan } from "../src";
import { RegistryClient } from "../src/utils/registry";

vi.mock("tinyexec", () => ({
  x: vi.fn(),
}));

const exec = vi.mocked(x);
const tempDirs: string[] = [];

beforeEach(() => {
  exec.mockReset();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("registry client", () => {
  test("caches package version lookups", async () => {
    const client = new RegistryClient({
      npmClient: "pnpm",
    });

    exec.mockResolvedValue(execResult({ stdout: '"1.0.1"\n' }));

    await expect(
      client.packageVersion("@acme/core", "1.0.1", {
        cwd: "/repo/packages/core",
        registry: "https://registry.example.test",
      }),
    ).resolves.toBe("1.0.1");
    await expect(
      client.packageVersionExists("@acme/core", "1.0.1", {
        cwd: "/repo/packages/core",
        registry: "https://registry.example.test",
      }),
    ).resolves.toBe(true);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(
      "pnpm",
      [
        "view",
        "@acme/core@1.0.1",
        "version",
        "--json",
        "--registry",
        "https://registry.example.test",
      ],
      {
        nodeOptions: {
          cwd: "/repo/packages/core",
        },
      },
    );
  });

  test("caches package existence lookups", async () => {
    const client = new RegistryClient({
      npmClient: "npm",
    });

    exec.mockResolvedValue(execResult({ stdout: '"@acme/core"\n' }));

    await expect(client.packageExists("@acme/core")).resolves.toBe(true);
    await expect(client.packageExists("@acme/core")).resolves.toBe(true);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith("npm", ["view", "@acme/core", "name", "--json"], {
      nodeOptions: {
        cwd: undefined,
      },
    });
  });

  test("returns false for missing package versions", async () => {
    const client = new RegistryClient({
      npmClient: "npm",
    });

    exec.mockResolvedValue(
      execResult({
        exitCode: 1,
        stderr: "npm ERR! code E404\nnpm ERR! 404 Not Found",
      }),
    );

    await expect(client.packageVersionExists("@acme/core", "9.9.9")).resolves.toBe(false);
  });

  test("returns successful publish plan status", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tegami-registry-"));
    const packagePath = join(cwd, "packages/core");
    tempDirs.push(cwd);

    await mkdir(packagePath, { recursive: true });
    await writeJson(join(packagePath, "package.json"), {
      name: "@acme/core",
      version: "1.0.1",
      publishConfig: {
        registry: "https://registry.example.test",
      },
    });
    exec.mockResolvedValue(execResult({ stdout: '"1.0.1"\n' }));

    const client = new RegistryClient({
      npmClient: "npm",
    });
    const plan = storedPlan(packagePath);
    const status = await client.publishPlanStatus(plan);

    expect(status).toEqual({
      state: "success",
    });
    expect(exec).toHaveBeenCalledWith(
      "npm",
      [
        "view",
        "@acme/core@1.0.1",
        "version",
        "--json",
        "--registry",
        "https://registry.example.test",
      ],
      {
        nodeOptions: {
          cwd: packagePath,
        },
      },
    );
  });

  test("returns pending publish plan status", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tegami-registry-"));
    const packagePath = join(cwd, "packages/core");
    tempDirs.push(cwd);

    await mkdir(packagePath, { recursive: true });
    await writeJson(join(packagePath, "package.json"), {
      name: "@acme/core",
      version: "1.0.1",
    });
    exec.mockResolvedValue(
      execResult({
        exitCode: 1,
        stderr: "npm ERR! code E404\nnpm ERR! 404 Not Found",
      }),
    );

    const client = new RegistryClient({
      npmClient: "npm",
    });

    await expect(client.publishPlanStatus(storedPlan(packagePath))).resolves.toEqual({
      state: "pending",
    });
  });
});

type ExecResult = Awaited<ReturnType<typeof x>>;

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    ...overrides,
  } as ExecResult;
}

function storedPlan(packagePath: string): PublishPlan {
  return {
    id: "tegami-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    changelogs: [],
    packages: [
      {
        name: "@acme/core",
        path: packagePath,
        oldVersion: "1.0.0",
        version: "1.0.1",
        type: "patch",
        reasons: [],
        changelogs: [],
        distTag: "latest",
        private: false,
        gitTag: "@acme/core@1.0.1",
        publish: true,
      },
    ],
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
