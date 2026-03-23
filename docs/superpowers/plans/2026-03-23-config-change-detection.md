# Config Change Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build startup/manual external config change detection with diff review, MCP manual-sync into app-owned storage, and registry-backed MCP operations.

**Architecture:** Split the work into two new backend units: `config_sync.rs` for logical source rendering, snapshot storage, diff generation, and ignore state; `mcp_registry.rs` for app-owned MCP persistence and external-file export/import. Keep the frontend thin: `App.tsx` owns one global check flow and dialog state, `ServersPage` only triggers manual checks, and existing MCP actions gradually switch from external files to the registry as the single business source.

**Tech Stack:** React 19, TypeScript, Tauri 2, Rust, serde/serde_json, toml_edit, similar, Node.js built-in test runner, existing Rust integration tests

**Execution note:** Per repository instructions, do not add `git commit` steps unless the user explicitly asks later.

**Spec:** `docs/superpowers/specs/2026-03-23-config-change-detection-design.md`

---

## File Map

- Create: `app-v2/src-tauri/crates/aidevhub-core/src/config_sync.rs` — logical config sources, text snapshot store, diff generation, ignore-state handling, and source rendering for the four logical config files.
- Create: `app-v2/src-tauri/crates/aidevhub-core/src/mcp_registry.rs` — app-owned MCP registry persistence, per-client replacement/import, and external-file export helpers.
- Create: `app-v2/src-tauri/crates/aidevhub-core/tests/config_sync.rs` — Rust tests for detection, ignore baselines, and malformed MCP import blocking.
- Create: `app-v2/src-tauri/crates/aidevhub-core/tests/mcp_registry.rs` — Rust tests for accept-sync writes and registry-backed export behavior.
- Create: `app-v2/src/components/ConfigChangeDialog.tsx` — unified dialog for grouped config diffs and MCP accept/ignore actions.
- Create: `app-v2/tests/config-change-dialog.test.mjs` — source-level regression checks for the new dialog.
- Create: `app-v2/tests/app-startup-config-check.test.mjs` — source-level regression checks for startup-triggered config checks.
- Create: `app-v2/tests/servers-manual-config-check.test.mjs` — source-level regression checks for the manual check button and handler wiring.
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs` — add config-check payloads, snapshot metadata, and MCP registry models.
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/lib.rs` — export `config_sync` and `mcp_registry`.
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs` — orchestrate new commands, switch MCP list/get/edit/toggle/add/profile flows to registry-backed behavior, and phase out `disabled_pool.json` as the MCP truth source.
- Modify: `app-v2/src-tauri/src/lib.rs` — add new Tauri commands and new app-local path wiring for `config_snapshots.json` and `mcp_registry.json`.
- Modify: `app-v2/src/lib/types.ts` — add frontend types for config checks, grouped diff items, and action responses.
- Modify: `app-v2/src/lib/api.ts` — add `configCheckUpdates`, `configIgnoreUpdates`, and `configAcceptMcpUpdates`.
- Modify: `app-v2/src/App.tsx` — trigger startup checks, own dialog state, and reuse one action pipeline for startup/manual checks.
- Modify: `app-v2/src/pages/ServersPage.tsx` — add `手动检查更新` button and update source label semantics from “外部文件” to “当前来源”.
- Modify: `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs` — update toggle/add/edit/profile behavior expectations for registry-backed MCP operations.
- Modify: `app-v2/src-tauri/crates/aidevhub-core/tests/source_file.rs` — update `source_file` assertions to the registry-owned source path.
- Modify: `app-v2/src-tauri/crates/aidevhub-core/tests/backup_ops.rs` — ensure registry-backed writes still emit the correct backup op for external config changes.

## Implementation Notes

- Treat `codex.mcp.json`, `claudecode.mcp.json`, `codex.skill.json`, and `claudecode.skill.json` as **logical sources** only; backend maps them to today’s real paths/directories.
- `Skill` never enters `mcp_registry.json`.
- `MCP` accept-sync only updates the registry and snapshot store; it must not overwrite external files.
- After registry cutover, `server_list`, `server_get`, and `server_get_edit_session` return the registry path in `source_file`; update the UI label from `来源文件` to `当前来源` to match the new semantics.
- Keep `disabled_pool.json` only as temporary migration input if needed; do not leave it as a second MCP source of truth.

### Task 1: Add backend config snapshot detection and ignore flow

**Files:**
- Create: `app-v2/src-tauri/crates/aidevhub-core/src/config_sync.rs`
- Create: `app-v2/src-tauri/crates/aidevhub-core/tests/config_sync.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/lib.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing Rust tests**

Add tests in `app-v2/src-tauri/crates/aidevhub-core/tests/config_sync.rs` for:
- first check returns changed logical sources when snapshots are missing
- ignoring a source stores `ignored_text_hash` and suppresses the same version on the next check
- changing external text after an ignore produces a new pending change again
- malformed external MCP content still produces a diff item but marks it as not confirmable

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test config_sync --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
Expected: FAIL because config-check models, snapshot paths, and detection functions do not exist yet

- [ ] **Step 3: Write minimal backend implementation**

Implement:
- `config_snapshots_path` on `AppPaths`
- config-check response structs in `model.rs` (`ConfigSourceKind`, `ConfigChangeItem`, `ConfigCheckResult`, snapshot records)
- `config_sync.rs` helpers to:
  - render the four logical sources into text
  - load/save `config_snapshots.json`
  - compute hash/diff/ignored-baseline state
  - return grouped changes for startup/manual checks
  - persist ignore actions
- Tauri commands in `app-v2/src-tauri/src/lib.rs`:
  - `config_check_updates`
  - `config_ignore_updates`

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test config_sync --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
Expected: PASS

### Task 2: Add frontend startup/manual check UI and unified diff dialog

**Files:**
- Create: `app-v2/src/components/ConfigChangeDialog.tsx`
- Create: `app-v2/tests/config-change-dialog.test.mjs`
- Create: `app-v2/tests/app-startup-config-check.test.mjs`
- Create: `app-v2/tests/servers-manual-config-check.test.mjs`
- Modify: `app-v2/src/lib/types.ts`
- Modify: `app-v2/src/lib/api.ts`
- Modify: `app-v2/src/App.tsx`
- Modify: `app-v2/src/pages/ServersPage.tsx`

- [ ] **Step 1: Write the failing frontend/source tests**

Add checks for:
- `ConfigChangeDialog` renders grouped logical-source labels and reuses `DiffViewer`
- `App.tsx` triggers `configCheckUpdates` in a startup `useEffect`
- `ServersPage.tsx` renders a `手动检查更新` button
- startup and manual check paths both route into the same dialog state and action callbacks

- [ ] **Step 2: Run test to verify it fails**

Run:
- `node app-v2/tests/config-change-dialog.test.mjs`
- `node app-v2/tests/app-startup-config-check.test.mjs`
- `node app-v2/tests/servers-manual-config-check.test.mjs`

Expected: FAIL because the dialog, API methods, and UI wiring do not exist yet

- [ ] **Step 3: Write minimal frontend implementation**

Implement:
- config-check types and API wrappers
- `ConfigChangeDialog.tsx` with:
  - grouped source summary
  - per-source diff tabs/cards
  - `确认更新 MCP` / `忽略本次变化` / `关闭` actions
- startup-owned `runConfigCheck` flow in `App.tsx`
- `ServersPage` manual button that calls the same `runConfigCheck` pipeline
- source label update from `来源文件` to `当前来源` in MCP detail/edit cards

- [ ] **Step 4: Run test to verify it passes**

Run:
- `node app-v2/tests/config-change-dialog.test.mjs`
- `node app-v2/tests/app-startup-config-check.test.mjs`
- `node app-v2/tests/servers-manual-config-check.test.mjs`

Expected: PASS

### Task 3: Add MCP registry persistence and accept-sync command

**Files:**
- Create: `app-v2/src-tauri/crates/aidevhub-core/src/mcp_registry.rs`
- Create: `app-v2/src-tauri/crates/aidevhub-core/tests/mcp_registry.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/lib.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/config_sync.rs`

- [ ] **Step 1: Write the failing Rust tests**

Add tests in `app-v2/src-tauri/crates/aidevhub-core/tests/mcp_registry.rs` for:
- accepting `codex.mcp.json` writes the Codex slice into `mcp_registry.json`
- accepting `claudecode.mcp.json` writes the Claude slice into `mcp_registry.json`
- accept-sync updates snapshot baseline state but leaves external files unchanged
- malformed external MCP content rejects the accept action

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test mcp_registry --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
Expected: FAIL because the registry store and accept-sync command do not exist yet

- [ ] **Step 3: Write minimal registry implementation**

Implement:
- `mcp_registry_path` on `AppPaths`
- registry structs and load/save helpers
- import helpers from current external MCP formats into normalized registry entries
- `config_accept_mcp_updates` Tauri command that:
  - validates selected logical MCP sources
  - imports external MCP content into the registry
  - updates corresponding snapshot baselines
  - does not write back to external files

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test mcp_registry --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
Expected: PASS

### Task 4: Switch MCP reads to the app-owned registry

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/tests/source_file.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs`
- Modify: `app-v2/src/lib/types.ts`
- Modify: `app-v2/src/pages/ServersPage.tsx`

- [ ] **Step 1: Write the failing Rust/UI regression tests**

Extend tests for:
- `server_list` and `server_get` returning MCP data from `mcp_registry.json` instead of live external config files
- `source_file` pointing at the registry path after cutover
- `server_get_edit_session` exposing registry-backed editable payloads
- MCP detail UI showing the updated “当前来源” wording

- [ ] **Step 2: Run test to verify it fails**

Run:
- `cargo test source_file --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test server_get --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `node app-v2/tests/servers-manual-config-check.test.mjs`

Expected: FAIL because reads still come from external files and the UI wording is still tied to the old source semantics

- [ ] **Step 3: Write minimal registry-backed read implementation**

Implement:
- `server_list`, `server_get`, and `server_get_edit_session` reading from the registry
- a single mapping for registry path -> `source_file`
- UI copy updates so the path shown is framed as the app-owned current source, not the external file

- [ ] **Step 4: Run test to verify it passes**

Run:
- `cargo test source_file --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test server_get --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `node app-v2/tests/servers-manual-config-check.test.mjs`

Expected: PASS

### Task 5: Switch MCP writes to registry-backed export logic

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/tests/backup_ops.rs`

- [ ] **Step 1: Write the failing Rust tests**

Extend `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs` and `app-v2/src-tauri/crates/aidevhub-core/tests/backup_ops.rs` for:
- enabling an MCP reads config from the registry and appends it to the external file
- disabling an MCP removes it from the external file but keeps the registry entry
- editing a disabled MCP updates only the registry
- editing an enabled MCP updates registry first, then the external file
- adding a new MCP creates a registry entry and writes externally only when enabled
- profile apply converges external enabled sets from the registry, not from the old disabled pool
- backup ops still classify external writes as `Toggle`, `AddServer`, `EditServer`, or `ApplyProfile`

- [ ] **Step 2: Run test to verify it fails**

Run:
- `cargo test toggle --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test profile_apply --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test backup_ops --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`

Expected: FAIL because write paths still mutate external files directly and still depend on the old Claude disabled-pool flow

- [ ] **Step 3: Write minimal registry-backed write implementation**

Implement:
- registry-first add/edit/toggle/profile flows in `ops.rs`
- per-client external export helpers that:
  - append enabled MCPs
  - remove disabled MCPs
  - preserve unrelated external config content
- migration away from `disabled_pool.json` as the MCP truth source

- [ ] **Step 4: Run test to verify it passes**

Run:
- `cargo test toggle --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test profile_apply --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test backup_ops --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`

Expected: PASS

### Task 6: Full verification

**Files:**
- Verify only; no planned code changes

- [ ] **Step 1: Run targeted frontend regression checks**

Run:
- `node app-v2/tests/config-change-dialog.test.mjs`
- `node app-v2/tests/app-startup-config-check.test.mjs`
- `node app-v2/tests/servers-manual-config-check.test.mjs`

Expected: PASS

- [ ] **Step 2: Run targeted Rust suites**

Run:
- `cargo test config_sync --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test mcp_registry --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test source_file --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
- `cargo test backup_ops --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`

Expected: PASS

- [ ] **Step 3: Run full Rust test suite**

Run: `cargo test --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
Expected: PASS

- [ ] **Step 4: Run frontend type-check**

Run: `./node_modules/.bin/tsc -p tsconfig.json`
Workdir: `app-v2`
Expected: PASS
