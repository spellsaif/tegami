## Tegami

WIP.

## Current Design

T egami has two main phases: versioning and publishing.

During the versioning phase, `tegami().draft()` reads changelog files, discovers workspace packages, computes package releases, updates manifests and changelogs, and writes `.tegami/publish-plan.json`. Publish plans are kept as separate queued batches. They are not merged by package, so sequential releases like `pkg-a@1.0.0` and `pkg-a@2.0.0` can both be represented and published in order.

Publish plan files do not store mutable status. This keeps CI publishing simple: a release job can publish from the committed plan without needing to write a follow-up commit that marks the plan complete or removes it.

During the publish phase, `tegami().publish()` reads the queued plans, checks the remote registry, skips versions that already exist, and publishes only missing versions. The publish phase does not update or remove the plan file.

Cleanup happens during the next versioning phase. Before writing a new plan, Tegami checks queued plans against the registry, removes already-published package entries, and drops plans that have no remaining unpublished packages. Unpublished entries stay queued so failed CI publishes can be retried.
