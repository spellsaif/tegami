import type { LogGenerator } from "../types";

export function simpleGenerator(): LogGenerator {
  return {
    generate(release) {
      const lines = [
        `## ${release.version}`,
        "",
        ...release.changelogs.flatMap((entry) => [`### ${entry.title}`, "", entry.content, ""]),
      ];

      return lines.join("\n").trim();
    },
  };
}
