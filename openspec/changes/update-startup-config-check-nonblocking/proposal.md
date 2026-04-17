# Change: Make startup config checks non-blocking

## Why
The app currently performs external config change detection during startup in a way that can block UI responsiveness while large skill directories are scanned. This causes the desktop window to appear unresponsive even though the initial screen is already rendered.

## What Changes
- Make startup config change detection non-blocking from the user's perspective.
- Preserve the existing detection semantics and update-item behavior after background detection completes.
- Define the expected UI behavior while startup detection is still running.

## Impact
- Affected specs: `config-change-sync`
- Affected code: `app-v2/src/App.tsx`, `app-v2/src/lib/api.ts`, `app-v2/src-tauri/src/lib.rs`, `app-v2/src-tauri/crates/aidevhub-core/src/config_sync.rs`
