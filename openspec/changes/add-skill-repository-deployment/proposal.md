# Change: Add Skill Repository and Multi-Target Deployment Management

## Why
Current skill management treats Claude Code and Codex external skill directories as the source of truth. That model cannot support durable internal retention, multi-target deployment, project-level skill distribution, or controlled sync-back from externally edited copies.

## What Changes
- Add an internal skill repository that stores complete skill folder contents inside AIDevHub-managed local data.
- Add repository metadata and deployment records so one skill can be deployed to multiple Claude/Codex global and project targets.
- Change skill enable/disable semantics from direct in-place movement to deployment add/remove from the internal repository.
- Add drift detection and user-confirmed sync-back from external deployed copies into the internal repository.
- Preserve external discovery, but treat it as an import source rather than the only managed skill inventory.

## Impact
- Affected specs: `skill-management`, `skill-repository-deployment`
- Affected code: `app-v2/src/pages/SkillsPage.tsx`, `app-v2/src/lib/api.ts`, `app-v2/src/lib/types.ts`, `app-v2/src-tauri/src/lib.rs`, `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`, related models and persistence files
