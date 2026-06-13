import { x } from "tinyexec";

export type NpmClient = "npm" | "pnpm";

export async function publishPackage(
  packagePath: string,
  distTag: string,
  access: "public" | "restricted" | undefined,
  npmClient: NpmClient,
): Promise<void> {
  const args = ["publish", "--tag", distTag];

  if (access) {
    args.push("--access", access);
  }

  await x(npmClient, args, {
    nodeOptions: {
      cwd: packagePath,
    },
    throwOnError: true,
  });
}
