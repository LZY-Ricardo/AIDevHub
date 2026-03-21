# AIDevHub (MVP) 桌面端

本目录是 AIDevHub 的桌面端实现，技术栈为 **Tauri v2 + Rust + React + TypeScript（Vite）**。

## 当前实现范围（与代码同步）

- 查看 Claude Code / Codex 的 MCP servers 列表
- 详情抽屉展示来源文件、字段说明，并支持敏感值按需揭示
- 单个 server 启用/禁用：`preview -> apply`（写入前 diff 预览 + 自动备份）
- 新增 server（`stdio` / `http`）：`preview -> apply`
- 编辑已有 server（结构化表单 + 高级 JSON 片段）：`preview -> apply`
- Profiles：CRUD；按客户端收敛式 apply（启用集合精确等于 Profile）
- Skills：Codex skills + Claude commands（列表/详情/创建/启用禁用；写入前预览）
- Backups：备份记录列表；回滚 `preview -> apply`

## 开发环境

- Node.js + pnpm
- Rust (stable)
- Tauri v2 依赖（不同系统安装方式不同，建议按官方文档准备）

## 常用命令

在 `app-v2/` 目录下执行：

```bash
pnpm install
pnpm tauri dev
```

构建安装包：

```bash
pnpm tauri build
```

仅运行前端（不启动 Tauri Shell）：

```bash
pnpm dev
```

## 目录结构速览

- `src/`：React UI
- `src/pages/`：Servers / Add / Profiles / Skills / Backups
- `src/styles/`：`theme.css`（CSS variables）+ `ui.css`（组件样式）
- `src-tauri/`：Rust 后端（Tauri commands + 核心逻辑）
  - `src-tauri/src/lib.rs`：commands 注册入口（IPC）
  - `src-tauri/crates/aidevhub-core/`：解析/写回、diff、备份/回滚、Profiles、Skills、MCP 说明等核心逻辑

## 路由说明（MVP）

前端使用 hash route：

- `#/servers`
- `#/add`
- `#/profiles`
- `#/skills`
- `#/backups`

默认入口为 `#/servers`。
