# AIDevHub

AIDevHub 是一个本地桌面应用（Tauri v2 + Rust + React），用于集中管理 **Claude Code** 与 **OpenAI Codex** 的 MCP server 配置与 Skills：查看、启用/禁用、新增、编辑、Profile 切换、健康检查，并提供写入前 diff 预览、自动备份/回滚，以及外部配置变更检测与同步。

**当前版本：0.2.0**

## 已实现功能

### Server / MCP 管理

- Servers 列表与详情抽屉（Claude Code + Codex；支持敏感值按需揭示、自动说明与人工说明）
- 单个 server 启用/禁用：`preview -> apply`，写入前 unified diff 预览；写入前自动备份
- 新增 server（`stdio` / `http`）：`preview -> apply`
- 编辑已有 server（结构化表单 + 高级 JSON 片段）：`preview -> apply`
- **健康检查**：单个/批量检测 server 连通性（stdio 使用 JSON-RPC 握手，http 使用 HTTP 端点探测）；支持并发检查（最多 5 并行）、超时控制（15s 总超时）；在列表中显示状态（checking/ok/fail/timeout）与延迟

### Profile 管理

- CRUD；按客户端收敛式 apply（启用集合精确等于 profile targets）

### Skills 管理

- Codex skills + Claude commands（列表/详情/创建/启用禁用，写入前预览）
- 按客户端/作用域筛选，搜索（名称/描述/skill_id）

### Backups & Rollback

- 备份记录列表；回滚 `preview -> apply`
- 备份元数据包含操作类型、摘要描述、受影响的 server ID

### Dashboard

- 实时统计概览（MCP 总数/活跃数、Skill 总数/用户安装数）
- 最近活动流（展示真实备份记录，含相对时间、操作类型、受影响 server 名称）
- 快捷操作入口（添加 MCP、安装 Skill）

### 配置变更检测与同步

- **外部配置监控**：启动时及手动触发检查 Claude/Codex 配置文件和 Skills 目录的 SHA256 快照变化
- **变更展示**：按来源分组、unified diff / split diff 视图、懒加载、行数切换
- **变更处理**：
  - 忽略更新（标记当前为基线）
  - 同步到项目 MCP 注册表（将外部变更导入内部管理）
- **MCP 注册表外部 Diff**：
  - 检查内部注册表与外部配置差异
  - 预览/应用将项目 MCP 写回本地配置文件（含备份）
  - 支持 `open_diff`（完整 diff）和 `summary_only`（摘要）两种展示模式

### Settings

- MCP diff 检查模式偏好设置（`open_diff` / `summary_only`）
- 应用版本显示与自动更新检查（下载进度、安装重启）

### UI/UX

- 顶部导航栏 + hash 路由（`#/dashboard`、`#/mcp`、`#/skills`、`#/settings`）
- 写入前预览对话框（WritePreviewDialog）
- Diff 查看器（unified / split 双模式）
- 表格组件（Server/Skill/Backup 列表，sticky 操作列）
- 详情抽屉（Detail Drawer）
- 错误提示（固定位置 Toast）
- 加载状态（Spinner、busy 状态管理）

### 构建 & CI/CD

- 跨平台构建（Linux、macOS、Windows）
- GitHub Actions CI/CD 自动构建与发布
- Tauri updater 插件集成，支持自动更新

## 未实现/暂不做

- 项目级配置（Claude `.mcp.json`、Codex `.codex/config.toml`）
- 导入/导出

## 开发与运行

前置：

- Node.js + pnpm
- Rust (stable) + Tauri v2 环境依赖（按官方文档安装）

在本仓库根目录：

```bash
cd "app-v2"
pnpm install
pnpm tauri dev
```

仅运行前端（不启动 Tauri Shell）：

```bash
cd "app-v2"
pnpm dev
```

## 关键路径与目录结构

- `app-v2/`：桌面应用（Vite + React 前端 + Tauri 后端）
- `app-v2/src-tauri/src/lib.rs`：Tauri commands（IPC）注册入口
- `app-v2/src-tauri/crates/aidevhub-core/`：核心逻辑（解析/写回、diff、备份、Profiles、Skills、MCP 说明、健康检查、配置变更检测、注册表同步）
- `docs/`：需求、技术方案、接口文档、功能设计规格与实施计划
- `design-system/`：设计系统（与 `app-v2/src/styles/*.css` 同步）

## 配置文件与本地数据

被管理的客户端配置：

- Claude Code：`~/.claude.json`（仅 user scope）
- Codex：若设置 `CODEX_HOME` 则为 `CODEX_HOME/config.toml`；否则为 `~/.codex/config.toml`

应用本地数据目录（Tauri `app_local_data_dir()`，Local 语义）下文件：

- `profiles.json`
- `mcp_notes.json`（MCP 人工说明与字段提示）
- `disabled_pool.json`（Claude 的"禁用池"）
- `settings.json`（应用设置）
- `config_snapshots/`（配置文件 SHA256 快照，用于变更检测）
- `backups/`（用户配置文件备份）
- `backup_index.json`（备份索引，best-effort 更新）

备注：

- 备份只针对用户配置文件（`~/.claude.json`、`~/.codex/config.toml`）；应用自身的 `profiles.json` / `mcp_notes.json` 等不做备份。

## Tauri IPC Commands（37 个）

| 类别 | 命令 | 说明 |
|------|------|------|
| Runtime | `runtime_get_info` | 获取运行时路径与配置状态 |
| Server | `server_list` | 列出所有 server |
| | `server_get` | 获取 server 详情（可选揭示敏感值） |
| | `server_get_edit_session` | 获取编辑会话数据 |
| | `server_notes_get` / `server_notes_put` | 读写 server 人工说明 |
| | `server_preview_toggle` / `server_apply_toggle` | 预览/应用启用禁用 |
| | `server_preview_add` / `server_apply_add` | 预览/应用新增 server |
| | `server_preview_edit` / `server_apply_edit` | 预览/应用编辑 server |
| Health | `mcp_health_check` | 单个 server 健康检查 |
| | `mcp_health_check_all` | 批量健康检查 |
| Profile | `profile_list` / `profile_create` / `profile_update` / `profile_delete` | Profile CRUD |
| | `profile_preview_apply` / `profile_apply` | 预览/应用 profile |
| Backup | `backup_list` | 列出备份记录 |
| | `backup_preview_rollback` / `backup_apply_rollback` | 预览/应用回滚 |
| Config | `config_check_updates` | 检查外部配置变更 |
| | `config_ignore_updates` | 忽略变更（标记基线） |
| | `config_accept_mcp_updates` | 同步 MCP 变更到注册表 |
| Registry | `mcp_check_registry_external_diff` | 检查注册表与外部配置差异 |
| | `mcp_preview_sync_registry_to_external` / `mcp_apply_sync_registry_to_external` | 预览/应用注册表同步到外部 |
| Settings | `settings_get` / `settings_put` | 读写应用设置 |
| Skill | `skill_list` / `skill_get` | 列出/获取 skill |
| | `skill_preview_create` / `skill_apply_create` | 预览/应用创建 skill |
| | `skill_preview_toggle` / `skill_apply_toggle` | 预览/应用启用禁用 skill |

## 文档索引

- `docs/需求规格文档.md`
- `docs/技术实现方案文档.md`
- `docs/接口文档.md`
- `docs/MCP编辑功能设计方案.md`
- `docs/技能管理功能开发文档.md`
- `docs/superpowers/specs/` — 各功能设计规格文档
- `docs/superpowers/plans/` — 各功能实施计划
- `design-system/aidevhub/MASTER.md`
