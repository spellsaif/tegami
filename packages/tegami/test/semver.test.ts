import { describe, expect, test } from "vitest";
import { bumpVersion, maxBump, updateRange } from "../src/utils/semver";

describe("semver helpers", () => {
  test("chooses the highest bump type", () => {
    expect(maxBump("patch", "minor")).toBe("minor");
    expect(maxBump("minor", "major")).toBe("major");
    expect(maxBump("patch", "patch")).toBe("patch");
  });

  test("bumps versions with semver", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  test("updates regular dependency ranges", () => {
    expect(updateRange("^1.0.0", "1.2.0")).toBe("^1.2.0");
    expect(updateRange("~1.0.0", "1.2.0")).toBe("~1.2.0");
    expect(updateRange("1.0.0", "1.2.0")).toBe("1.2.0");
    expect(updateRange("*", "1.2.0")).toBe("*");
  });

  test("updates workspace dependency ranges", () => {
    expect(updateRange("workspace:^1.0.0", "1.2.0")).toBe("workspace:^1.2.0");
    expect(updateRange("workspace:~1.0.0", "1.2.0")).toBe("workspace:~1.2.0");
    expect(updateRange("workspace:*", "1.2.0")).toBe("workspace:*");
  });

  test("rejects invalid versions and ranges", () => {
    expect(() => bumpVersion("not-a-version", "patch")).toThrow(/Invalid semver version/);
    expect(() => updateRange("bad range", "1.2.0")).toThrow(/Invalid semver range/);
    expect(() => updateRange("^1.0.0", "bad-version")).toThrow(/Invalid semver version/);
  });
});
