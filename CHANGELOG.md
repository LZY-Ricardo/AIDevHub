# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-04-17

### Added

- Skill 内部仓库支持直接安装到本机全局目录
  - 可直接安装到 `~/.codex/skills`
  - 可直接安装到 `~/.claude/skills` / `~/.claude/commands`
- 内部仓库 Skill 增加安装状态展示
  - 显示未安装、已安装到 Claude / Codex、安装缺失等状态

### Changed

- Skill 详情页将“投放”操作区上移到详情信息前方
- 项目级与全局级 Skill 投放体验收口
  - 内部仓库列表新增直接安装入口
  - 列表与详情抽屉的全局安装按钮规则保持一致
- Updater 发布密钥切换到新的签名密钥链
  - 从 `0.4.0` 开始后续版本沿用新密钥

### Fixed

- 项目投放路径校验增强
  - 项目根目录必须存在且必须是目录
- Skill 投放预览与实际写入范围保持一致
  - 预览会展开整个 Skill 目录，而不再只显示入口文件
- 内部仓库安装状态判断修正
  - `missing` 不再误判为已安装
  - 项目投放不会误伤全局安装状态

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
[0.4.0]: https://github.com/LZY-Ricardo/AIDevHub/releases/tag/app-v0.4.0
[0.2.0]: https://github.com/LZY-Ricardo/AIDevHub/releases/tag/app-v0.2.0
[0.1.0]: https://github.com/LZY-Ricardo/AIDevHub/releases/tag/app-v0.1.0
