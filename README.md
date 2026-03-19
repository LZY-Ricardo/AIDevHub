# AIDevHub (MVP)

AIDevHub 是一个本地桌面应用（Tauri v2 + Rust + React），用于集中管理 **Claude Code** 与 **OpenAI Codex** 的 MCP server 配置：查看、启用/禁用、新增、Profile 切换，并提供写入前 diff 预览与自动备份/回滚。

## 当前实现范围（截至 2026-03-18）

已实现（P0）：

- Servers 列表（Claude Code + Codex）
- 单个 server 启用/禁用：`preview -> apply`，写入前 unified diff 预览；写入前自动备份
- 新增 server（`stdio` / `http`）：`preview -> apply`
- Profiles：CRUD；按客户端收敛式 apply（启用集合精确等于 profile）
- Skills：Codex skills + Claude commands（列表/详情/创建/启用禁用，写入前预览）
- Backups：备份记录列表；回滚 `preview -> apply`

未实现/暂不做（MVP）：

- 项目级配置（Claude `.mcp.json`、Codex `.codex/config.toml`）
- 导入/导出
- 健康检查（连通性/命令可用性深度检测）

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
- `app-v2/src-tauri/crates/aidevhub-core/`：核心逻辑（解析/写回、diff、备份、Profiles）
- `docs/`：需求、技术方案、接口文档
- `design-system/`：设计系统（与 `app-v2/src/styles/*.css` 同步）

## 配置文件与本地数据

被管理的客户端配置（MVP）：

- Claude Code：`~/.claude.json`（仅 user scope，MVP 不改 project scope）
- Codex：若设置 `CODEX_HOME` 则为 `CODEX_HOME/config.toml`；否则为 `~/.codex/config.toml`

应用本地数据目录（Tauri `app_local_data_dir()`，Local 语义）下文件：

- `profiles.json`
- `disabled_pool.json`（Claude 的“禁用池”）
- `backups/`（用户配置文件备份）
- `backup_index.json`（备份索引，best-effort 更新）

备注：

- 备份只针对用户配置文件（`~/.claude.json`、`~/.codex/config.toml`）；应用自身的 `profiles.json` 等不做备份。

## 文档索引

- `docs/需求规格文档.md`
- `docs/技术实现方案文档.md`
- `docs/接口文档.md`
- `design-system/aidevhub/MASTER.md`
