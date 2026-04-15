# Project Context

## Purpose
AIDevHub is a local desktop app for managing Claude Code and OpenAI Codex MCP servers, skills, profiles, backups, and config synchronization from one place. The product focuses on safe local configuration workflows: preview before write, diff visibility, backups before mutation, rollback support, and detection of external config drift.

## Tech Stack
- Frontend: React 19, TypeScript, Vite 7
- Desktop shell: Tauri v2
- Backend/core logic: Rust 2021 workspace crate (`aidevhub-core`)
- Package management: pnpm
- Testing: Node.js built-in test runner for JS tests, `cargo test` for Rust core tests
- CI/CD: GitHub Actions with Tauri build/release automation

## Project Conventions

### Code Style
TypeScript follows the existing repo style: 2-space indentation, double quotes, trailing commas, PascalCase for React components, camelCase for utilities, and focused modules under `app-v2/src/lib/`. Rust uses snake_case module/file names and should be formatted with `cargo fmt`. Prefer reading existing code before refactoring and keep implementations simple, direct, and local unless duplication is proven.

### Architecture Patterns
The app is split into a React UI in `app-v2/src/`, Tauri entrypoints in `app-v2/src-tauri/src/`, and reusable Rust business logic in `app-v2/src-tauri/crates/aidevhub-core/`. UI state is primarily local React state with typed IPC calls routed through `src/lib/api.ts`. Mutating flows generally follow `preview -> confirm/apply`, and config synchronization logic belongs in Rust core rather than duplicated in the frontend.

### Testing Strategy
Behavioral changes should add or update tests. JS tests live in `app-v2/tests/*.test.mjs` and cover UI-facing flows and helper logic. Rust tests live under `app-v2/src-tauri/crates/aidevhub-core/tests/` and cover registry sync, backups, file ops, and config detection. Before review, run the most relevant subset plus `pnpm build`; for desktop-impacting changes, validate in `pnpm tauri dev`.

### Git Workflow
Commit messages follow Conventional Commits, usually `type(scope): summary` such as `feat(mcp-ui): ...` or `fix(updater): ...`. Pull requests should include a short summary, change list, local test plan, OS coverage, and screenshots for UI work. CI builds on pull requests to `main`; release builds are triggered from `release` or version tags.

## Domain Context
This project manages user-local Claude and Codex configuration, not remote hosted infrastructure. Important domain concepts are MCP servers, skill/command enablement, profile-based activation, backup/rollback, external config snapshotting, and registry-to-external synchronization. The app must preserve user trust by making local mutations explicit and reversible.

## Important Constraints
- Do not write user config blindly; preserve preview/diff and backup-first flows.
- Managed config files include `~/.claude.json` and `~/.codex/config.toml` (or `CODEX_HOME/config.toml`).
- App-local data such as registry metadata, notes, settings, and backups live under the Tauri local data directory.
- Avoid introducing cloud dependencies for core management flows.
- Follow existing OpenSpec workflow for proposals before substantial new capabilities or architecture changes.

## External Dependencies
- Tauri runtime and plugins: opener, process, updater
- Local Claude Code and OpenAI Codex config files/directories
- GitHub Actions for CI/CD and release packaging
- System WebView / platform-specific Tauri dependencies for desktop builds
