## 1. Repository Foundation
- [x] 1.1 Add internal skill repository storage layout under app local data with per-skill folders and manifest files.
- [x] 1.2 Add persisted indexes for catalog entries, deployments, target profiles, and sync events.
- [x] 1.3 Add directory hashing and repository metadata update logic.

## 2. Discovery and Import
- [x] 2.1 Split external skill discovery from managed repository listing.
- [x] 2.2 Add preview/apply import flow from discovered global skills into the internal repository.
- [x] 2.3 Preserve imported source metadata without treating external directories as the repository truth.

## 3. Deployment Management
- [x] 3.1 Add deployment records for Claude/Codex global and project targets.
- [x] 3.2 Add preview/apply deployment flow that copies repository skills to external targets.
- [x] 3.3 Add preview/apply undeploy flow that removes external copies while preserving repository contents.
- [x] 3.4 Support multiple concurrent deployment targets per skill.

## 4. Drift Detection and Sync-Back
- [x] 4.1 Add per-deployment drift/outdated/missing status evaluation.
- [x] 4.2 Add preview/apply sync-back from an external deployment into the repository.
- [x] 4.3 Mark other deployments outdated when repository content changes from sync-back or direct repository updates.

## 5. Frontend and UX
- [x] 5.1 Add repository-backed skill listing and detail views.
- [x] 5.2 Add deployment list, target selection, and status presentation in the skill detail workflow.
- [x] 5.3 Preserve preview-before-apply semantics for import, deploy, undeploy, and sync-back.

## 6. Validation
- [x] 6.1 Add tests for repository persistence, deployment copy/remove, and drift detection.
- [x] 6.2 Add tests for sync-back and multi-target deployment state transitions.
- [x] 6.3 Validate OpenSpec changes with `openspec validate add-skill-repository-deployment --strict`.
