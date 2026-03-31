# Fix Windows Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Tauri v2 updater so that in-app updates on Windows actually replace the installed exe files and persist across app restarts.

**Architecture:** Add `windows.installMode` config to `tauri.conf.json`, restructure Rust plugin initialization to register updater before `.setup()`, merge the frontend download+install+relaunch into a single atomic operation so Windows NSIS installer can properly replace files without a race condition.

**Tech Stack:** Tauri v2, tauri-plugin-updater v2, tauri-plugin-process v2, React/TypeScript

---

### Task 1: Add Windows installMode to tauri.conf.json

**Files:**
- Modify: `app-v2/src-tauri/tauri.conf.json:37-44`

- [ ] **Step 1: Add `windows.installMode` to the updater plugin config**

In `app-v2/src-tauri/tauri.conf.json`, replace the `plugins` section (lines 37-44):

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/LZY-Ricardo/AIDevHub/releases/latest/download/latest.json"
    ],
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDZBREM5MDIwQjFFOTAyODMKUldTREF1bXhJSkRjYXAxU0JHUTI0OFl5ZUVxV2Y4QjNKNG5odWc0OHBSQUdhKzg2THNiUVJkb3AK",
    "windows": {
      "installMode": "passive"
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app-v2/src-tauri/tauri.conf.json
git commit -m "fix(updater): add Windows installMode passive config"
```

---

### Task 2: Restructure Rust plugin initialization

**Files:**
- Modify: `app-v2/src-tauri/src/lib.rs:423-476`

- [ ] **Step 1: Move updater and process plugins out of `.setup()` into the builder chain**

In `app-v2/src-tauri/src/lib.rs`, replace the `run()` function (lines 423-476) with:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_updater::Builder::new()
                .on_before_exit(|| {
                    // On Windows, the app exits before NSIS installer replaces files.
                    // Any cleanup before exit goes here.
                })
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            runtime_get_info,
            server_list,
            server_get,
            server_get_edit_session,
            server_notes_get,
            server_notes_put,
            server_preview_toggle,
            server_apply_toggle,
            server_preview_add,
            server_apply_add,
            server_preview_edit,
            server_apply_edit,
            profile_list,
            profile_create,
            profile_update,
            profile_delete,
            profile_preview_apply,
            profile_apply,
            backup_list,
            backup_preview_rollback,
            backup_apply_rollback,
            config_check_updates,
            config_ignore_updates,
            config_accept_mcp_updates,
            mcp_check_registry_external_diff,
            mcp_preview_sync_registry_to_external,
            mcp_apply_sync_registry_to_external,
            settings_get,
            settings_put,
            skill_list,
            skill_get,
            skill_preview_create,
            skill_apply_create,
            skill_preview_toggle,
            skill_apply_toggle,
            mcp_health_check,
            mcp_health_check_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Key changes:
- `.setup()` block removed entirely (it only contained the two plugin registrations)
- `tauri_plugin_updater` registered via `.plugin()` with `.on_before_exit()` callback
- `tauri_plugin_process` registered via `.plugin()` directly
- Both are now in the builder chain, before `.invoke_handler()` — this is the recommended init order per Tauri docs

- [ ] **Step 2: Verify the Rust code compiles**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2/src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` with no errors

- [ ] **Step 3: Commit**

```bash
git add app-v2/src-tauri/src/lib.rs
git commit -m "fix(updater): restructure plugin init with on_before_exit callback"
```

---

### Task 3: Merge download+install+relaunch in updater.ts

**Files:**
- Modify: `app-v2/src/lib/updater.ts` (full rewrite)

- [ ] **Step 1: Replace the entire file content**

Replace `app-v2/src/lib/updater.ts` with:

```typescript
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateProgress {
  downloaded: number;
  total: number | undefined;
}

export async function checkForUpdate() {
  return check();
}

export async function downloadInstallAndRelaunch(
  onProgress?: (progress: UpdateProgress) => void,
) {
  const update = await check();
  if (!update) {
    throw new Error("No update available");
  }

  let downloaded = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength;
        downloaded = 0;
        onProgress?.({ downloaded, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
        break;
      case "Finished":
        break;
    }
  });

  // On Windows, downloadAndInstall triggers the NSIS installer which
  // terminates the app — this line is never reached. On macOS/Linux,
  // relaunch() executes normally to apply the update.
  await relaunch();
}
```

Key changes:
- `downloadAndInstallUpdate()` and `relaunchApp()` removed
- New single function `downloadInstallAndRelaunch()` that does all three steps atomically
- `checkForUpdate()` kept unchanged (still used by UpdateChecker for the initial check)
- `relaunch()` is called immediately after `downloadAndInstall()` — on Windows the app exits before reaching this, on macOS/Linux it restarts

- [ ] **Step 2: Commit**

```bash
git add app-v2/src/lib/updater.ts
git commit -m "fix(updater): merge download+install+relaunch into single atomic operation"
```

---

### Task 4: Simplify UpdateChecker UI flow

**Files:**
- Modify: `app-v2/src/components/UpdateChecker.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file content**

Replace `app-v2/src/components/UpdateChecker.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdate, downloadInstallAndRelaunch } from "../lib/updater";

type Phase = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

export function UpdateChecker() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [newVersion, setNewVersion] = useState<string>("");
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState("");
  const [appVersion, setAppVersion] = useState("...");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("unknown"));
  }, []);

  async function handleCheck() {
    setPhase("checking");
    setErrorMsg("");
    try {
      const update = await checkForUpdate();
      if (update) {
        setNewVersion(update.version);
        setPhase("available");
      } else {
        setPhase("up-to-date");
      }
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      setPhase("error");
    }
  }

  async function handleDownloadInstall() {
    setPhase("downloading");
    try {
      await downloadInstallAndRelaunch((p) => {
        setProgress({ downloaded: p.downloaded, total: p.total || 0 });
      });
      // On Windows, app exits during downloadAndInstall (NSIS takes over).
      // On macOS/Linux, relaunch() restarts the app immediately.
      // Neither platform reaches this point, but if it does, reset to idle.
      setPhase("idle");
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      setPhase("error");
    }
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <section className="ui-card" style={{ padding: "16px" }}>
        <div className="ui-label">应用更新</div>
        <div className="ui-help" style={{ marginTop: "8px" }}>
          当前版本：{appVersion}
        </div>

        <div style={{ marginTop: "16px" }}>
          {phase === "idle" && (
            <button
              type="button"
              className="ui-btn ui-btnPrimary"
              onClick={handleCheck}
            >
              检查更新
            </button>
          )}

          {phase === "checking" && (
            <span className="ui-help">正在检查更新…</span>
          )}

          {phase === "up-to-date" && (
            <div>
              <span style={{ color: "var(--color-success, #22c55e)" }}>
                已是最新版本
              </span>
              <button
                type="button"
                className="ui-btn"
                style={{ marginLeft: "12px" }}
                onClick={() => setPhase("idle")}
              >
                再次检查
              </button>
            </div>
          )}

          {phase === "available" && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                发现新版本：
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                  {newVersion}
                </span>
              </div>
              <button
                type="button"
                className="ui-btn ui-btnPrimary"
                onClick={handleDownloadInstall}
              >
                下载并安装
              </button>
            </div>
          )}

          {phase === "downloading" && (
            <div style={{ display: "grid", gap: "8px" }}>
              <span className="ui-help">正在下载并安装更新…</span>
              {progress.total > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      flex: 1,
                      height: "6px",
                      borderRadius: "3px",
                      background: "var(--color-border, #e5e7eb)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (progress.downloaded / progress.total) * 100)}%`,
                        height: "100%",
                        background: "var(--color-accent, #3b82f6)",
                        borderRadius: "3px",
                        transition: "width 0.2s",
                      }}
                    />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                    {Math.round((progress.downloaded / progress.total) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {phase === "error" && (
            <div>
              <div className="ui-error" style={{ padding: "12px" }}>
                {errorMsg}
              </div>
              <button
                type="button"
                className="ui-btn"
                style={{ marginTop: "12px" }}
                onClick={() => setPhase("idle")}
              >
                重试
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

Key changes:
- Removed `Phase` value `"downloaded"` — no intermediate state
- Removed `handleRelaunch()` function and `relaunchApp` import
- `handleDownload()` renamed to `handleDownloadInstall()` — calls `downloadInstallAndRelaunch()` directly
- Import changed from `downloadAndInstallUpdate, relaunchApp` to `downloadInstallAndRelaunch`
- The "downloaded" JSX block (old lines 141-154) removed entirely
- Download progress text changed to "正在下载并安装更新…" to reflect the new atomic flow

- [ ] **Step 2: Commit**

```bash
git add app-v2/src/components/UpdateChecker.tsx
git commit -m "fix(updater): simplify UI flow — remove intermediate downloaded state"
```

---

### Task 5: Verify frontend builds

**Files:**
- No changes, verification only

- [ ] **Step 1: Run TypeScript type check**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 2: Run frontend build**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && pnpm build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Final commit (if any lint fixes needed)**

Only if fixes were required during verification.
