# Change: Add Outdated Deployment Redeploy

## Why
The current skill repository model correctly marks sibling deployments as `outdated` after sync-back or repository updates, but it does not yet define a first-class workflow for redeploying the latest repository version to those outdated targets. Without that capability, operators can detect staleness but cannot efficiently bring targets back in sync.

## What Changes
- Add a redeploy workflow for `outdated` deployments so users can preview and apply repository-to-target refreshes.
- Define how redeploy updates deployment status and source hash after the target is refreshed.
- Expose redeploy in the managed skill detail workflow for outdated targets.

## Impact
- Affected specs: `skill-repository-deployment`
- Affected code: `app-v2/src-tauri/crates/aidevhub-core/src/skill_repo.rs`, `app-v2/src-tauri/src/lib.rs`, `app-v2/src/lib/api.ts`, `app-v2/src/lib/types.ts`, `app-v2/src/pages/SkillsPage.tsx`, repository tests
