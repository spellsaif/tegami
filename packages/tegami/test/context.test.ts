import { detect } from "package-manager-detector";
import { x } from "tinyexec";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTegamiContext } from "../src/context";
import type { TegamiPlugin } from "../src/types";

vi.mock("package-manager-detector", () => ({
  detect: vi.fn(),
}));
vi.mock("tinyexec", () => ({
  x: vi.fn(),
}));

const detectPackageManager = vi.mocked(detect);
const exec = vi.mocked(x);

beforeEach(() => {
  detectPackageManager.mockReset();
  exec.mockReset();
  exec.mockResolvedValue({
    exitCode: 0,
    stdout: '"1.0.0"\n',
    stderr: "",
  } as Awaited<ReturnType<typeof x>>);
});

describe("tegami context", () => {
  test("uses an explicit npm client without detecting", async () => {
    const context = await createTegamiContext({
      cwd: "/repo",
      npmClient: "npm",
    });

    await context.registryClient.packageVersionExists("@acme/core", "1.0.0");

    expect(exec).toHaveBeenCalledWith("npm", ["view", "@acme/core@1.0.0", "version", "--json"], {
      nodeOptions: {
        cwd: "/repo",
      },
    });
    expect(detectPackageManager).not.toHaveBeenCalled();
  });

  test("detects pnpm when creating a project context", async () => {
    detectPackageManager.mockResolvedValue({
      name: "pnpm",
      agent: "pnpm",
    });

    const context = await createTegamiContext({
      cwd: "/repo",
    });

    await context.registryClient.packageVersionExists("@acme/core", "1.0.0");

    expect(exec).toHaveBeenCalledWith("pnpm", ["view", "@acme/core@1.0.0", "version", "--json"], {
      nodeOptions: {
        cwd: "/repo",
      },
    });
    expect(detectPackageManager).toHaveBeenCalledTimes(1);
    expect(detectPackageManager).toHaveBeenCalledWith({
      cwd: "/repo",
    });
  });

  test("falls back to npm for unsupported package managers", async () => {
    detectPackageManager.mockResolvedValue({
      name: "yarn",
      agent: "yarn",
    });

    const context = await createTegamiContext({
      cwd: "/repo",
    });

    await context.registryClient.packageVersionExists("@acme/core", "1.0.0");

    expect(exec).toHaveBeenCalledWith("npm", ["view", "@acme/core@1.0.0", "version", "--json"], {
      nodeOptions: {
        cwd: "/repo",
      },
    });
  });

  test("stores plugins in enforce order", async () => {
    const plugins = [
      plugin("default-a"),
      plugin("post-a", "post"),
      plugin("pre-a", "pre"),
      plugin("default-b", "default"),
      plugin("pre-b", "pre"),
      plugin("post-b", "post"),
    ];

    const context = await createTegamiContext({
      cwd: "/repo",
      npmClient: "npm",
      plugins,
    });

    expect(context.plugins.map((plugin) => plugin.name)).toMatchInlineSnapshot(`
      [
        "pre-a",
        "pre-b",
        "default-a",
        "default-b",
        "post-a",
        "post-b",
      ]
    `);
  });
});

function plugin(name: string, enforce?: TegamiPlugin["enforce"]): TegamiPlugin {
  return {
    name,
    enforce,
  };
}
