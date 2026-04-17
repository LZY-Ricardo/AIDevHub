## 1. Backend
- [x] 1.1 Add preview/apply redeploy operations for outdated deployments.
- [x] 1.2 Refresh target contents from the repository and update deployment source hash/version-tracking state.
- [x] 1.3 Keep non-outdated deployments unchanged during single-target redeploy.

## 2. Frontend
- [x] 2.1 Surface a redeploy action for outdated deployments in the managed skill detail workflow.
- [x] 2.2 Route redeploy through the existing preview-before-apply flow.

## 3. Validation
- [x] 3.1 Add repository tests covering outdated redeploy preview and apply.
- [x] 3.2 Run `cargo test -p aidevhub-core --test skill_repo -- --nocapture`.
- [x] 3.3 Run `pnpm build`.
- [x] 3.4 Validate OpenSpec changes with `openspec validate add-outdated-deployment-redeploy --strict`.
