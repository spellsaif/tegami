import type { PlanStore } from "../schemas";

export interface PublishPlanStatus {
  state: "pending" | "success";
  error?: string;
}

export interface RegistryClient {
  packageVersionExists(name: string, version: string): Promise<boolean>;
  publish(pkg: { path: string; distTag?: string }): Promise<void>;
  publishPlanStatus(plan: PlanStore): Promise<PublishPlanStatus>;
}
