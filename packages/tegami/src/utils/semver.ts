import { diff, inc, valid, validRange } from "semver";

export type BumpType = "major" | "minor" | "patch";

export function maxBump(a: BumpType, b: BumpType): BumpType {
  if (a === "major" || b === "major") return "major";
  if (a === "minor" || b === "minor") return "minor";
  return "patch";
}

export function bumpVersion(version: string, type: BumpType): string {
  const next = inc(version, type);

  if (!next) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return next;
}

export function inferBumpType(previousVersion: string, nextVersion: string): BumpType {
  const releaseType = diff(previousVersion, nextVersion);

  if (releaseType === "major" || releaseType === "minor" || releaseType === "patch") {
    return releaseType;
  }

  throw new Error(`Cannot infer release type from ${previousVersion} to ${nextVersion}.`);
}

export function updateRange(currentRange: string, nextVersion: string): string {
  if (!valid(nextVersion)) {
    throw new Error(`Invalid semver version: ${nextVersion}`);
  }

  if (currentRange.startsWith("workspace:")) {
    const workspaceRange = currentRange.slice("workspace:".length);
    const updated = updateBareRange(workspaceRange, nextVersion);

    return `workspace:${updated}`;
  }

  return updateBareRange(currentRange, nextVersion);
}

function updateBareRange(currentRange: string, nextVersion: string): string {
  if (currentRange === "*" || currentRange === "latest") return currentRange;
  if (currentRange === "^" || currentRange === "~") return `${currentRange}${nextVersion}`;
  if (currentRange.startsWith("^")) return `^${nextVersion}`;
  if (currentRange.startsWith("~")) return `~${nextVersion}`;

  if (validRange(currentRange)) {
    return nextVersion;
  }

  throw new Error(`Invalid semver range: ${currentRange}`);
}
