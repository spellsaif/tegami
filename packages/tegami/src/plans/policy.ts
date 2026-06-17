import type { TegamiContext } from "../context";
import type { PlanPolicy } from "./draft";

export function groupPolicy({ graph }: TegamiContext): PlanPolicy {
  return {
    id: "group",
    onUpdate({ pkg, plan }) {
      if (!plan.type) return;

      const group = graph.getPackageGroup(pkg.id);
      if (!group || !group.options.syncBump) return;

      for (const member of group.packages) {
        if (member === pkg) continue;

        this.bumpPackage(member, {
          type: plan.type,
          reason: `sync "${group.name}" group package versions`,
        });
      }
    },
  };
}
