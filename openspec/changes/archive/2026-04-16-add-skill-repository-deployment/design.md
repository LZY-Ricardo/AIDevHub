## Context

AIDevHub currently manages skills by scanning external Claude Code and Codex directories and then operating directly on those external paths. That works for simple enable/disable flows, but it is not sufficient for:

- keeping a durable internal copy of every managed skill
- deploying one skill to multiple global and project-level targets
- treating undeploy as removal of an external copy rather than loss of the skill itself
- allowing users to modify deployed copies and sync those changes back into the internal repository

The new model must make the internal repository the system of record while preserving external discovery as an import source.

## Goals / Non-Goals

- Goals:
  - store full skill contents in an internal repository
  - support deployment to Claude/Codex global and project targets
  - support multiple concurrent deployments per skill
  - detect deployment drift and allow user-confirmed sync-back into the repository
  - preserve preview-before-apply semantics for all write actions
- Non-Goals:
  - automatic bidirectional sync without user confirmation
  - merge-based conflict resolution
  - version-history browsing inside the first release
  - support for arbitrary non-directory command artifacts inside the new repository model

## Decisions

- Decision: The repository is the source of truth.
  - Why: direct external-directory ownership prevents durable retention and multi-target distribution.
  - Alternatives considered: keep external directories as truth and store a cache only. Rejected because undeploy, project-level deployment, and sync-back become ambiguous.

- Decision: Deployments are copy-based, not move-based or link-based.
  - Why: the repository must keep a durable master copy at all times, and link-based behavior is platform-fragile.
  - Alternatives considered: filesystem moves and symlink/junction deployment. Rejected due to loss of stable master content or platform complexity.

- Decision: Drift handling is user-confirmed sync-back.
  - Why: deployed copies may be manually edited, but the repository still needs controlled ownership of the canonical copy.
  - Alternatives considered: forbid external edits or automatically overwrite them. Rejected because user workflows explicitly require external editing and optional sync-back.

- Decision: One skill may have many deployments.
  - Why: the same skill may need to exist simultaneously in Claude global, Codex global, and multiple project targets.
  - Alternatives considered: per-client single target or global/project mutual exclusion. Rejected because it conflicts with the requested usage model.

## Data Model

Primary repository object:

- `SkillCatalogEntry`
  - stable `skill_id`
  - human-facing `slug` and `display_name`
  - repository path info
  - `content_hash` and `version`
  - compatibility and source metadata

Per-deployment object:

- `SkillDeployment`
  - stable `deployment_id`
  - target type: `claude_global`, `codex_global`, `claude_project`, `codex_project`
  - deployment path info
  - deployment status: `deployed`, `disabled`, `missing`, `drifted`, `outdated`, `error`
  - source version/hash and last-seen target hash

Optional convenience object:

- `SkillTargetProfile`
  - reusable target roots for frequent project deployments

## Storage Layout

Under app local data:

```text
skill-store/
  repo/
    <skill_id>/
      manifest.json
      files/
        SKILL.md
        ...
  indexes/
    skill_index.json
    skill_deployments.json
    skill_targets.json
    skill_sync_events.json
  cache/
    discovered_global_skills.json
    discovered_project_skills.json
  staging/
    <operation_id>/
```

Repository `files/` holds only skill contents. AIDevHub control files stay outside the deployed skill tree.

## Core Flows

### Flow: Import discovered global skill into repository

1. Scan external global directories and build discovery records.
2. User selects a discovered skill and requests import.
3. Preview shows repository folder creation, manifest creation, and index updates.
4. Apply copies the external skill into `repo/<skill_id>/files/`.
5. Catalog and optional initial deployment metadata are persisted.

### Flow: Deploy repository skill to target

1. User selects a repository skill and target type/root.
2. System validates target path and deployment-name collisions.
3. Preview shows copied directory tree and deployment index changes.
4. Apply copies repository files to the target skill path.
5. Deployment record is created or updated to `deployed`.

### Flow: Undeploy target while preserving repository

1. User selects an existing deployment and requests disable/remove.
2. Preview shows target directory removal and deployment state update.
3. Apply removes the external copy only.
4. Repository content remains unchanged.
5. Deployment record becomes `disabled`.

### Flow: Detect drift

1. System scans each deployment target path.
2. Missing target path marks deployment `missing`.
3. Existing target hash equal to source hash remains `deployed`.
4. Existing target hash different from source hash marks deployment `drifted` unless the repository has advanced and the target still matches an older source hash, in which case it becomes `outdated`.

### Flow: Sync back external deployment into repository

1. User opens a `drifted` deployment and requests sync-back.
2. Preview shows diff from repository files to external deployment files.
3. Apply copies the external deployment tree into the repository files tree.
4. Repository `content_hash` and `version` are updated.
5. The source deployment is marked `deployed` against the new version.
6. Other deployments of the same skill become `outdated`.

### Flow: Redeploy outdated targets

1. User selects one or more `outdated` deployments.
2. Preview shows repository-to-target replacement.
3. Apply replaces the target copy with the latest repository contents.
4. Deployment returns to `deployed`.

## API Surface

Recommended command groups:

- discovery:
  - `skill_discovery_scan_global`
  - `skill_discovery_scan_project`
- repository:
  - `skill_repo_list`
  - `skill_repo_get`
  - `skill_repo_preview_import`
  - `skill_repo_apply_import`
  - `skill_repo_preview_create`
  - `skill_repo_apply_create`
- deployment:
  - `skill_deployment_list`
  - `skill_deployment_preview_add`
  - `skill_deployment_apply_add`
  - `skill_deployment_preview_remove`
  - `skill_deployment_apply_remove`
  - `skill_deployment_preview_redeploy`
  - `skill_deployment_apply_redeploy`
- sync:
  - `skill_deployment_check_one`
  - `skill_deployment_check_all`
  - `skill_repo_preview_sync_from_deployment`
  - `skill_repo_apply_sync_from_deployment`

## Frontend Shape

The current single-list skill page is insufficient. The frontend should evolve toward:

- repository skill list
- skill detail with deployment list
- deploy-to-target action flow
- undeploy action flow
- drift/outdated badges
- sync-back action flow

External discovery remains available as an import entry flow rather than the primary managed list.

## Risks / Trade-offs

- Allowing sync-back means repository updates can invalidate many deployments at once.
  - Mitigation: explicitly mark sibling deployments `outdated` rather than silently rewriting them.

- Supporting both Claude and Codex project targets requires path-validation logic that may vary by client conventions.
  - Mitigation: keep target path rules explicit in deployment records and validate before apply.

- Current command-based Claude skills and directory-based skills do not fit exactly the same artifact shape.
  - Mitigation: first release of repository-backed deployment should prioritize directory-based skills and keep compatibility shims for current command listing behavior.

## Migration Plan

1. Add repository storage and indexes without breaking existing skill listing.
2. Add import flow from discovered global skills.
3. Add deployment flows for global targets.
4. Add deployment flows for project targets.
5. Add drift detection and sync-back.
6. Migrate the primary skill UI from direct external management to repository-backed management.

## Open Questions

- Whether Claude command-style file-based artifacts should be fully absorbed into the repository deployment model in the first iteration or remain in a compatibility path.
- Whether first release should expose reusable target profiles in the UI or keep project targets as free-form path entry.
