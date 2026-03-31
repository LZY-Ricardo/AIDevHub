# Fix: Tauri v2 Updater Not Persisting on Windows

## Problem

On Windows, the in-app updater appears to work (downloads update, shows new version after restart), but the installed exe files are not replaced. Closing and reopening the app reverts to the old version.

**Root cause:** Missing `windows.installMode` configuration in `tauri.conf.json`, and a flow mismatch between the UI (two-step: download then manual restart) and Windows behavior (`downloadAndInstall` terminates the app automatically).

## Solution Overview

Minimum changes to align with Tauri v2's recommended update flow:

1. Add Windows-specific updater config
2. Adjust Rust-side updater initialization
3. Fix frontend updater flow to call `relaunch()` immediately after `downloadAndInstall()`
4. Simplify UI to remove the intermediate "downloaded, click to restart" state

## Changes

### 1. `app-v2/src-tauri/tauri.conf.json`

Add `windows.installMode` to the updater plugin config:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/LZY-Ricardo/AIDevHub/releases/latest/download/latest.json"
    ],
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDZBREM5MDIwQjFFOTAyODMKUldTREF1bXhJSkRjYXAxU0JHUTI0OFl5ZUVxV2Y4QjNKNG5odWc0OHBSQUdhKzg2THNiUVJkb3MK",
    "windows": {
      "installMode": "passive"
    }
  }
}
```

`passive` mode: shows a small progress window, no user interaction needed, can request admin elevation if required.

### 2. `app-v2/src-tauri/src/lib.rs`

Move updater and process plugin registration out of `.setup()` into the builder chain. Add `on_before_exit` for clean shutdown on Windows:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(
        tauri_plugin_updater::Builder::new()
            .on_before_exit(|| {
                // App is about to exit on Windows for NSIS install
            })
            .build(),
    )
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
        // existing setup logic (path resolution, etc.)
        Ok(())
    })
    // ... rest unchanged
```

### 3. `app-v2/src/lib/updater.ts`

Merge download+install and relaunch into a single function. The key insight: on Windows, `downloadAndInstall()` terminates the app during NSIS install, so `relaunch()` after it never executes (which is fine). On macOS/Linux, `relaunch()` executes normally.

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

  // On Windows, downloadAndInstall triggers NSIS which terminates the app.
  // This relaunch() only executes on macOS/Linux.
  await relaunch();
}
```

Remove the old `downloadAndInstallUpdate` and `relaunchApp` exports.

### 4. `app-v2/src/components/UpdateChecker.tsx`

Remove the intermediate "downloaded" state and the separate restart button. The flow becomes:

- idle → user clicks "检查更新"
- checking → checking for update
- up-to-date | available → result shown
- available → user clicks "下载并安装"
- downloading → progress shown
- downloadAndInstall + relaunch happen in one step, app exits/restarts

The "downloaded" phase is removed because the app either:
- Exits immediately on Windows (NSIS installer takes over)
- Restarts immediately on macOS/Linux (via relaunch())

New Phase type: `"idle" | "checking" | "up-to-date" | "available" | "downloading" | "error"`

## Files Modified

| File | Change |
|------|--------|
| `app-v2/src-tauri/tauri.conf.json` | Add `windows.installMode` |
| `app-v2/src-tauri/src/lib.rs` | Restructure plugin init, add `on_before_exit` |
| `app-v2/src/lib/updater.ts` | Merge download+install+relaunch into one function |
| `app-v2/src/components/UpdateChecker.tsx` | Remove intermediate "downloaded" state, simplify flow |

## No New Dependencies

No new npm or cargo packages needed.

## Testing

1. Build a 0.1.0 version and install on Windows
2. Build a 0.2.0 version and publish to GitHub Releases
3. Run the 0.1.0 app, check for updates, download and install
4. Verify: NSIS installer window appears (passive mode)
5. Verify: After installer finishes, app relaunches as 0.2.0
6. Close app, reopen from same exe/shortcut — should still be 0.2.0
