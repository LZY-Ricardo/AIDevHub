## 1. Design
- [x] 1.1 Confirm the startup command(s) that perform heavy config and skill snapshot work.
- [x] 1.2 Define the non-blocking execution model for startup config detection and UI state transitions.

## 2. Backend
- [x] 2.1 Move startup config detection off the UI-blocking command execution path.
- [x] 2.2 Preserve existing config snapshot and update detection results after the background work completes.

## 3. Frontend
- [x] 3.1 Keep the app interactive while startup config detection is still in progress.
- [x] 3.2 Surface detected config updates after the background detection finishes.

## 4. Validation
- [x] 4.1 Add or update tests that cover the changed startup detection behavior where practical.
- [x] 4.2 Run the relevant Rust and frontend validation commands.
- [x] 4.3 Validate the OpenSpec change with `openspec validate update-startup-config-check-nonblocking --strict`.
