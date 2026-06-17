import type { TegamiContext } from "../context";
import type { PublishPlanStatus } from "../types";
import { handlePluginError } from "../utils/error";
import { readPlanStore, type PlanStore } from "./store";

export async function publishPlanStatus(
  store: PlanStore,
  context: TegamiContext,
): Promise<PublishPlanStatus> {
  async function defaultStatus(): Promise<PublishPlanStatus> {
    for (const [id, pkgPlan] of Object.entries(store.packages)) {
      const pkg = context.graph.get(id);
      if (!pkg || !pkgPlan.publish) continue;

      const published = await context.getRegistryClient(pkg).isPackagePublished(pkg);
      if (!published) return { state: "pending" };
    }

    return { state: "success" };
  }

  let status = await defaultStatus();
  for (const plugin of context.plugins) {
    const resolved = await handlePluginError(plugin, "resolvePlanStatus", () =>
      plugin.resolvePlanStatus?.call(context, status, { plan: store }),
    );
    if (resolved) status = resolved;
  }
  return status;
}

export async function assertPublishPlanFinished(context: TegamiContext): Promise<void> {
  const store = await readPlanStore(context);
  if (!store) return;
  const status = await publishPlanStatus(store, context);

  if (status.state === "pending") {
    throw new Error(
      `Publish plan already exists at ${context.planPath} and is pending. Publish it before applying a new plan.`,
    );
  }
}
