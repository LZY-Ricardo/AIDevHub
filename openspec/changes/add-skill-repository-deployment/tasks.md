## 1. Repository Foundation
- [ ] 1.1 Add internal skill repository storage layout under app local data with per-skill folders and manifest files.
- [ ] 1.2 Add persisted indexes for catalog entries, deployments, target profiles, and sync events.
- [ ] 1.3 Add directory hashing and repository metadata update logic.

## 2. Discovery and Import
- [ ] 2.1 Split external skill discovery from managed repository listing.
- [ ] 2.2 Add preview/apply import flow from discovered global skills into the internal repository.
- [ ] 2.3 Preserve imported source metadata without treating external directories as the repository truth.

## 3. Deployment Management
- [ ] 3.1 Add deployment records for Claude/Codex global and project targets.
- [ ] 3.2 Add preview/apply deployment flow that copies repository skills to external targets.
- [ ] 3.3 Add preview/apply undeploy flow that removes external copies while preserving repository contents.
- [ ] 3.4 Support multiple concurrent deployment targets per skill.

## 4. Drift Detection and Sync-Back
- [ ] 4.1 Add per-deployment drift/outdated/missing status evaluation.
- [ ] 4.2 Add preview/apply sync-back from an external deployment into the repository.
- [ ] 4.3 Mark other deployments outdated when repository content changes from sync-back or direct repository updates.

## 5. Frontend and UX
- [ ] 5.1 Add repository-backed skill listing and detail views.
- [ ] 5.2 Add deployment list, target selection, and status presentation in the skill detail workflow.
- [ ] 5.3 Preserve preview-before-apply semantics for import, deploy, undeploy, and sync-back.

## 6. Validation
- [ ] 6.1 Add tests for repository persistence, deployment copy/remove, and drift detection.
- [ ] 6.2 Add tests for sync-back and multi-target deployment state transitions.
- [ ] 6.3 Validate OpenSpec changes with `openspec validate add-skill-repository-deployment --strict`.
