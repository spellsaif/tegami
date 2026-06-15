import { inc, parse } from "semver";

export type BumpType = "major" | "minor" | "patch";

export function formatNpmDistTag(distTag?: string): string {
  return distTag && distTag !== "latest" ? ` (${distTag})` : "";
}

export function formatPackageVersion(name: string, version: string, distTag?: string): string {
  return `${name}@${version}${formatNpmDistTag(distTag)}`;
}

export function maxBump(a: BumpType, b: BumpType): BumpType {
  if (a === "major" || b === "major") return "major";
  if (a === "minor" || b === "minor") return "minor";
  return "patch";
}

export function bumpVersion(version: string, type: BumpType, prerelease?: string): string {
  let next: string | null;

  if (prerelease) {
    const parsed = parse(version);
    if (parsed?.prerelease[0] === prerelease) {
      next = inc(version, "prerelease", prerelease);
    } else {
      const preType = type === "major" ? "premajor" : type === "minor" ? "preminor" : "prepatch";
      next = inc(version, preType, prerelease);
    }
  } else {
    next = inc(version, type);
  }

  if (!next) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return next;
}
