# MCP Detail Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clearer MCP detail explanations with auto-generated summaries, editable human overrides, and per-field usage hints stored in app-owned metadata.

**Architecture:** Keep original MCP configs read-only and store human-authored notes in a new app-local JSON file keyed by `server_id`. Generate default descriptions in a focused frontend helper, then merge human overrides on read and render them in the detail drawer with lightweight inline editors. Reuse the existing Tauri JSON persistence pattern and atomically write metadata updates.

**Tech Stack:** React 19, TypeScript, Tauri 2, Rust, serde_json, Node.js built-in test runner, existing Rust integration tests

---

### Task 1: Add backend MCP notes persistence

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing Rust tests**

Add tests in `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs` for:
- loading notes when `mcp_notes.json` is missing returns empty notes
- saving notes for one `server_id` persists `description` and `field_hints`
- updating one server's notes does not clobber another server entry

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test mcp_notes --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
Expected: FAIL because notes types/functions/paths do not exist yet

- [ ] **Step 3: Write minimal backend implementation**

Implement:
- `mcp_notes_path` on `AppPaths`
- note model structs in `model.rs`
- `load_mcp_notes`, `save_mcp_notes`, `mcp_notes_get`, `mcp_notes_put` in `ops.rs`
- Tauri commands and `api` surface for get/put

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test mcp_notes --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
Expected: PASS

### Task 2: Add frontend explanation helper

**Files:**
- Create: `app-v2/src/lib/serverExplain.ts`
- Create: `app-v2/tests/server-explain.test.mjs`
- Modify: `app-v2/src/lib/types.ts`

- [ ] **Step 1: Write the failing Node tests**

Add tests in `app-v2/tests/server-explain.test.mjs` for:
- known MCP names return specific purpose text
- common config keys return the expected field hint
- human-authored notes override auto-generated description and field hints

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types app-v2/tests/server-explain.test.mjs`
Expected: FAIL because `serverExplain.ts` does not exist yet

- [ ] **Step 3: Write minimal helper implementation**

Implement:
- note-aware explanation types
- known MCP description dictionary
- default per-field hint generator
- merge logic: human notes > auto-generated > fallback

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types app-v2/tests/server-explain.test.mjs`
Expected: PASS

### Task 3: Render MCP detail explanations and inline editors

**Files:**
- Modify: `app-v2/src/lib/api.ts`
- Modify: `app-v2/src/pages/ServersPage.tsx`
- Modify: `app-v2/tests/servers-page-identifier.test.mjs`

- [ ] **Step 1: Write the failing UI/source regression checks**

Extend `app-v2/tests/servers-page-identifier.test.mjs` (or split if clearer) to assert:
- `MCP详情` contains a `功能作用` section
- the detail view now has a `配置说明` section
- the source keeps an `原始配置` section available as advanced info

- [ ] **Step 2: Run test to verify it fails**

Run: `node app-v2/tests/servers-page-identifier.test.mjs`
Expected: FAIL because the new sections/edit controls are not rendered yet

- [ ] **Step 3: Write minimal UI implementation**

Implement:
- load note metadata when opening detail drawer
- render merged summary and per-field explanations
- add inline edit/save/cancel UI for summary and field hints
- keep raw JSON behind an expandable section

- [ ] **Step 4: Run test to verify it passes**

Run: `node app-v2/tests/servers-page-identifier.test.mjs`
Expected: PASS

### Task 4: Full verification

**Files:**
- Verify only; no planned code changes

- [ ] **Step 1: Run backend tests**

Run: `cargo test --manifest-path app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`
Expected: PASS

- [ ] **Step 2: Run frontend utility tests**

Run: `node --experimental-strip-types app-v2/tests/server-explain.test.mjs`
Expected: PASS

- [ ] **Step 3: Run source-level UI regression checks**

Run: `node app-v2/tests/servers-page-identifier.test.mjs`
Expected: PASS

- [ ] **Step 4: Run type-check**

Run: `./node_modules/.bin/tsc -p tsconfig.json`
Workdir: `app-v2`
Expected: PASS
