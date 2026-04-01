# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-04-01

### Fixed

- Release version consistency across frontend and Tauri build metadata
  - Align `app-v2/package.json`, `app-v2/src-tauri/Cargo.toml`, and `app-v2/src-tauri/tauri.conf.json` to `0.3.1`
- Auto-release behavior in CI
  - Set GitHub Actions release publishing to non-draft so updater `latest.json` can advance immediately

## [0.2.0] - 2026-03-29

### Added

- MCP server health check (stdio JSON-RPC handshake / HTTP endpoint probe)
  - Batch check with concurrency limit (5) and timeout control (15s)
  - Health status display in server list (checking/ok/fail/timeout with latency)
- Configuration change detection & sync
  - SHA256 snapshot-based monitoring for Claude/Codex config files and Skills directories
  - Unified diff / split diff viewer for external changes
  - Ignore or sync external changes into internal MCP registry
- MCP registry external diff
  - Compare internal registry with external config
  - Preview/apply registry sync back to local config files
- Settings page with diff mode preference (`open_diff` / `summary_only`)
- App version display and auto-update (download progress, install & restart)
- Backup metadata now includes affected server IDs
- Activity feed shows real backup records with relative time and affected server names
- Dashboard quick actions (add MCP, install Skill)

### Fixed

- Windows backup filename containing colons causing rename failure (OS error 123)

## [0.1.0] - 2026-03-21

### Added

- Server list and detail drawer (Claude Code + Codex)
  - Sensitive value reveal on demand
  - Auto-generated and manual descriptions
- Single server enable/disable with `preview -> apply` workflow
  - Unified diff preview before write
  - Automatic backup before write
- Add new server (`stdio` / `http`) with `preview -> apply`
- Edit existing server (structured form + advanced JSON snippet) with `preview -> apply`
- Profiles CRUD with convergent apply per client
- Skills management (Codex skills + Claude commands)
  - List / detail / create / enable-disable with preview
  - Filter by client/scope, search by name/description/skill_id
- Backups list and rollback with `preview -> apply`
- Dashboard with stats overview and activity stream
- Top navigation bar with hash routing
- Write preview dialog (WritePreviewDialog)
- Diff viewer (unified / split dual mode)
- Table components with sticky action column
- Toast notifications and loading states
- Cross-platform build (Linux, macOS, Windows)
- GitHub Actions CI/CD auto build & release
- Tauri updater plugin integration

[0.3.1]: https://github.com/LZY-Ricardo/AIDevHub/releases/tag/app-v0.3.1
[0.2.0]: https://github.com/LZY-Ricardo/AIDevHub/releases/tag/app-v0.2.0
[0.1.0]: https://github.com/LZY-Ricardo/AIDevHub/releases/tag/app-v0.1.0
