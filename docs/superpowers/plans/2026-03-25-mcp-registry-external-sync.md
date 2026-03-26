# MCP Registry External Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-scoped MCP registry vs local-config diff detection, explicit sync-to-local actions, and a minimal Settings page that persists the preferred diff presentation mode.

**Architecture:** Reuse the existing registry export pipeline in `ops.rs` so the new flow only compares and replaces the MCP fragment for the selected client while preserving all non-MCP file content. Keep this new flow separate from the existing external-change detection dialog, and add a small persisted `app_settings.json` store for the diff presentation preference.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, Rust, serde, toml_edit, node:test, cargo test

---

**Spec:** `docs/superpowers/specs/2026-03-25-mcp-registry-external-sync-design.md`

**Repo Constraint:** `AGENTS.md` forbids planning git commits unless the user explicitly asks, so this plan intentionally omits commit steps.

## File Map

**Backend**
- Create: `app-v2/src-tauri/crates/aidevhub-core/src/app_settings.rs`
- Create: `app-v2/src-tauri/crates/aidevhub-core/tests/app_settings.rs`
- Create: `app-v2/src-tauri/crates/aidevhub-core/tests/mcp_registry_external_sync.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/lib.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`

**Frontend**
- Create: `app-v2/src/pages/SettingsPage.tsx`
- Create: `app-v2/src/components/McpConfigDiffDialog.tsx`
- Create: `app-v2/src/components/McpConfigDiffSummaryDialog.tsx`
- Create: `app-v2/tests/settings-page.test.mjs`
- Create: `app-v2/tests/servers-registry-sync.test.mjs`
- Create: `app-v2/tests/app-mcp-registry-sync-flow.test.mjs`
- Modify: `app-v2/src/App.tsx`
- Modify: `app-v2/src/components/AppShell.tsx`
- Modify: `app-v2/src/pages/ServersPage.tsx`
- Modify: `app-v2/src/lib/api.ts`
- Modify: `app-v2/src/lib/types.ts`

### Task 1: Persist MCP Diff Display Settings

**Files:**
- Create: `app-v2/src-tauri/crates/aidevhub-core/src/app_settings.rs`
- Create: `app-v2/src-tauri/crates/aidevhub-core/tests/app_settings.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/lib.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing Rust settings tests**

```rust
#[test]
fn settings_get_returns_default_mode_when_file_missing() {
    let settings = app_settings::load_settings(&paths).unwrap();
    assert_eq!(settings.mcp_diff_check_mode, McpDiffCheckMode::OpenDiff);
}

#[test]
fn settings_put_roundtrip_persists_summary_only_mode() {
    app_settings::save_settings(&paths, AppSettings {
        mcp_diff_check_mode: McpDiffCheckMode::SummaryOnly,
    }).unwrap();
    let reloaded = app_settings::load_settings(&paths).unwrap();
    assert_eq!(reloaded.mcp_diff_check_mode, McpDiffCheckMode::SummaryOnly);
}
```

- [ ] **Step 2: Run the settings tests to verify they fail**

Run: `cargo test --manifest-path "app-v2/src-tauri/crates/aidevhub-core/Cargo.toml" --test app_settings`

Expected: FAIL because `app_settings` module, `AppSettings`, or `McpDiffCheckMode` do not exist yet.

- [ ] **Step 3: Implement the minimal settings store and DTO wiring**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum McpDiffCheckMode {
    OpenDiff,
    SummaryOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub mcp_diff_check_mode: McpDiffCheckMode,
}

pub fn load_settings(paths: &AppPaths) -> Result<AppSettings, AppError> { /* file missing -> default */ }
pub fn save_settings(paths: &AppPaths, settings: &AppSettings) -> Result<AppSettings, AppError> { /* atomic write */ }
```

Implementation notes:
- Add `pub mod app_settings;` in `aidevhub-core/src/lib.rs`.
- Add settings DTOs to `model.rs`.
- Expose `settings_get` and `settings_put` tauri commands from `app-v2/src-tauri/src/lib.rs`.
- Store file at `paths.app_local_data_dir.join("app_settings.json")`.

- [ ] **Step 4: Re-run the settings tests to verify they pass**

Run: `cargo test --manifest-path "app-v2/src-tauri/crates/aidevhub-core/Cargo.toml" --test app_settings`

Expected: PASS with both settings tests green.

### Task 2: Add Backend MCP Fragment Diff / Preview / Apply Flow

**Files:**
- Create: `app-v2/src-tauri/crates/aidevhub-core/tests/mcp_registry_external_sync.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing Rust integration tests for fragment diff and writeback**

```rust
#[test]
fn claude_diff_only_compares_mcpservers_fragment() {
    let result = ops::mcp_check_registry_external_diff(&paths, Client::ClaudeCode).unwrap();
    assert!(result.has_diff);
    assert!(result.diff_unified.contains("mcpServers"));
}

#[test]
fn codex_preview_replaces_only_mcp_servers_table() {
    let preview = ops::mcp_preview_sync_registry_to_external(&paths, Client::Codex).unwrap();
    assert_eq!(preview.files.len(), 1);
    assert!(preview.files[0].diff_unified.contains("[mcp_servers.demo]"));
    assert!(preview.files[0].diff_unified.contains("theme = \"light\""));
}

#[test]
fn malformed_external_config_returns_parse_error() {
    let err = ops::mcp_preview_sync_registry_to_external(&paths, Client::ClaudeCode).unwrap_err();
    assert_eq!(err.code, "PARSE_ERROR");
}
```

- [ ] **Step 2: Run the new backend sync tests to verify they fail**

Run: `cargo test --manifest-path "app-v2/src-tauri/crates/aidevhub-core/Cargo.toml" --test mcp_registry_external_sync`

Expected: FAIL because the new ops/model APIs do not exist yet.

- [ ] **Step 3: Implement fragment-scoped diff, preview, and apply in `ops.rs`**

```rust
pub fn mcp_check_registry_external_diff(paths: &AppPaths, client: Client) -> Result<McpRegistryExternalDiff, AppError> { /* compare fragment only */ }

pub fn mcp_preview_sync_registry_to_external(paths: &AppPaths, client: Client) -> Result<WritePreview, AppError> { /* one-file preview */ }

pub fn mcp_apply_sync_registry_to_external(
    paths: &AppPaths,
    client: Client,
    expected: Vec<FilePrecondition>,
) -> Result<ApplyResult, AppError> { /* reuse apply_planned */ }
```

Implementation notes:
- Reuse `export_registry_client_config`.
- Add helper functions that:
  - extract the Claude `mcpServers` fragment from the existing JSON root
  - extract the Codex `mcp_servers` table from the existing TOML document
  - replace only that fragment while preserving non-MCP content
- Return a dedicated DTO with `client`, `target_path`, `has_diff`, `diff_unified`, `before_fragment`, and `after_fragment`.
- Reuse `build_preview` and `apply_planned` so backups and `expected_files` remain consistent with the rest of the app.
- Expose tauri commands in `app-v2/src-tauri/src/lib.rs`.

- [ ] **Step 4: Re-run the backend sync tests to verify they pass**

Run: `cargo test --manifest-path "app-v2/src-tauri/crates/aidevhub-core/Cargo.toml" --test mcp_registry_external_sync`

Expected: PASS with fragment diff, parse error, and precondition coverage green.

- [ ] **Step 5: Re-run the existing registry/ops regression tests**

Run: `cargo test --manifest-path "app-v2/src-tauri/crates/aidevhub-core/Cargo.toml" --test mcp_registry --test ops`

Expected: PASS, proving the new flow did not break existing registry import/export behavior.

### Task 3: Add the Settings Route, DTOs, and API Surface

**Files:**
- Create: `app-v2/src/pages/SettingsPage.tsx`
- Create: `app-v2/tests/settings-page.test.mjs`
- Modify: `app-v2/src/App.tsx`
- Modify: `app-v2/src/components/AppShell.tsx`
- Modify: `app-v2/src/lib/api.ts`
- Modify: `app-v2/src/lib/types.ts`

- [ ] **Step 1: Write the failing frontend tests for settings navigation and persistence hooks**

```js
test('AppShell 新增设置路由', () => {
  assert.match(shellSource, /"settings"/);
  assert.match(shellSource, /label:\s*"设置"/);
});

test('SettingsPage 暴露 MCP 差异展示方式设置', () => {
  assert.match(settingsSource, /MCP 差异检测结果展示方式/);
  assert.match(settingsSource, /open_diff/);
  assert.match(settingsSource, /summary_only/);
});

test('App 会加载并保存 app settings', () => {
  assert.match(appSource, /api\.settingsGet\(\)/);
  assert.match(appSource, /api\.settingsPut\(/);
});
```

- [ ] **Step 2: Run the new frontend settings tests to verify they fail**

Run: `node --test "app-v2/tests/settings-page.test.mjs"`

Expected: FAIL because the `settings` route, `SettingsPage`, and API methods do not exist yet.

- [ ] **Step 3: Implement the minimal settings page and API wiring**

```tsx
export function SettingsPage({
  settings,
  busy,
  onChangeMode,
}: {
  settings: AppSettings;
  busy: boolean;
  onChangeMode: (mode: McpDiffCheckMode) => Promise<void>;
}) {
  return (
    <div className="ui-card">
      <div className="ui-label">MCP 差异检测结果展示方式</div>
      {/* radio/select for open_diff vs summary_only */}
    </div>
  );
}
```

Implementation notes:
- Extend `RouteKey` with `settings`.
- Update `readRouteFromHash()` to accept `#/settings`.
- Add `settingsGet()` / `settingsPut()` to `app-v2/src/lib/api.ts`.
- Add TypeScript DTOs for `AppSettings` and `McpDiffCheckMode`.
- Load settings once in `App.tsx` and pass them into `SettingsPage`.

- [ ] **Step 4: Re-run the settings frontend tests to verify they pass**

Run: `node --test "app-v2/tests/settings-page.test.mjs"`

Expected: PASS with route, page copy, and API wiring assertions green.

### Task 4: Add MCP Management Diff / Sync UI Flow

**Files:**
- Create: `app-v2/src/components/McpConfigDiffDialog.tsx`
- Create: `app-v2/src/components/McpConfigDiffSummaryDialog.tsx`
- Create: `app-v2/tests/servers-registry-sync.test.mjs`
- Create: `app-v2/tests/app-mcp-registry-sync-flow.test.mjs`
- Modify: `app-v2/src/App.tsx`
- Modify: `app-v2/src/pages/ServersPage.tsx`
- Modify: `app-v2/src/lib/api.ts`
- Modify: `app-v2/src/lib/types.ts`

- [ ] **Step 1: Write the failing frontend tests for the new MCP page actions**

```js
test('ServersPage 提供检测项目与本地差异按钮', () => {
  assert.match(source, /检测项目与本地差异/);
});

test('ServersPage 提供写入项目内 MCP 到本地按钮', () => {
  assert.match(source, /写入项目内 MCP 到本地/);
});

test('App 根据 mcp_diff_check_mode 决定直接打开 diff 还是仅展示摘要', () => {
  assert.match(appSource, /mcp_diff_check_mode/);
  assert.match(appSource, /McpConfigDiffDialog/);
  assert.match(appSource, /McpConfigDiffSummaryDialog/);
});
```

- [ ] **Step 2: Run the new MCP UI tests to verify they fail**

Run: `node --test "app-v2/tests/servers-registry-sync.test.mjs" "app-v2/tests/app-mcp-registry-sync-flow.test.mjs"`

Expected: FAIL because the new buttons, dialogs, and App-level flow do not exist yet.

- [ ] **Step 3: Implement the App / ServersPage flow and dialogs**

```tsx
async function runRegistryExternalDiffCheck() {
  const result = await api.mcpCheckRegistryExternalDiff({ client });
  if (settings.mcp_diff_check_mode === "open_diff") {
    setMcpDiffDialog(result);
  } else {
    setMcpDiffSummary(result);
  }
}

async function syncRegistryToExternal(expected_files) {
  await api.mcpApplySyncRegistryToExternal({ client, expected_files });
  await load();
}
```

Implementation notes:
- Add two new callbacks to `ServersPage` props.
- Keep the new flow state separate from `configDialogOpen`, `updates`, and `configBusy`.
- Reuse `WritePreviewDialog` for the writeback preview.
- Use `McpConfigDiffSummaryDialog` only for `summary_only`; it should include a “查看差异” button that opens `McpConfigDiffDialog`.
- Refresh the current server list after a successful apply.

- [ ] **Step 4: Re-run the MCP UI tests to verify they pass**

Run: `node --test "app-v2/tests/servers-registry-sync.test.mjs" "app-v2/tests/app-mcp-registry-sync-flow.test.mjs"`

Expected: PASS with new button copy and mode-based flow assertions green.

### Task 5: Full Verification and Regression Sweep

**Files:**
- Modify: `docs/superpowers/plans/2026-03-25-mcp-registry-external-sync.md` (check off completed items during execution)

- [ ] **Step 1: Run the focused frontend source tests together**

Run: `node --test "app-v2/tests/settings-page.test.mjs" "app-v2/tests/servers-registry-sync.test.mjs" "app-v2/tests/app-mcp-registry-sync-flow.test.mjs" "app-v2/tests/app-startup-config-check.test.mjs" "app-v2/tests/servers-manual-config-check.test.mjs" "app-v2/tests/sidebar-minimal-shell.test.mjs"`

Expected: PASS, confirming the new settings/sync flow coexists with the old MCP management and shell behavior.

- [ ] **Step 2: Run the full core Rust suite**

Run: `cargo test --manifest-path "app-v2/src-tauri/crates/aidevhub-core/Cargo.toml"`

Expected: PASS across `app_settings`, `mcp_registry_external_sync`, existing `config_sync`, `mcp_registry`, `ops`, and backup/source-file tests.

- [ ] **Step 3: Run the frontend production build**

Run: `npm run build`

Workdir: `app-v2`

Expected: PASS with TypeScript compile and Vite build succeeding.

- [ ] **Step 4: Smoke-check the Tauri crate compilation if frontend or command signatures changed**

Run: `cargo test --manifest-path "app-v2/src-tauri/Cargo.toml"`

Expected: PASS, verifying tauri command wiring still compiles cleanly.
