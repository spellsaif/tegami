import { detect } from "package-manager-detector";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTegamiContext } from "../src/context";

vi.mock("package-manager-detector", () => ({
  detect: vi.fn(),
}));

const detectPackageManager = vi.mocked(detect);

beforeEach(() => {
  detectPackageManager.mockReset();
});

describe("tegami context", () => {
  test("uses an explicit npm client without detecting", async () => {
    const context = await createTegamiContext({
      cwd: "/repo",
      publish: {
        npmClient: "npm",
      },
    });

    expect(context.npmClient).toBe("npm");
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

    expect(context.npmClient).toBe("pnpm");

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

    expect(context.npmClient).toBe("npm");
  });
});
