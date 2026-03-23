# 配置文件变更检测与管理设计

**日期：** 2026-03-23

**目标**
- 项目启动时自动检测外部配置变化，并在发现新变化时明确提示用户。
- 使用统一对话框按文件分组展示差异，默认提供左右分栏对比视图。
- `MCP` 采用“项目内部副本 + 用户确认同步”模式，禁止检测到外部变化后自动覆盖项目内部数据。
- `Skill` 仅做检测与差异展示，不纳入项目内部副本管理。
- 增加 `手动检查更新` 按钮，复用与启动检测完全一致的流程。

**范围**
- 检测四个逻辑配置源：
  - `codex.mcp.json`
  - `claudecode.mcp.json`
  - `codex.skill.json`
  - `claudecode.skill.json`
- 前端新增统一变更弹窗与手动检查入口。
- 后端新增配置快照检测与 `MCP Registry` 存储。
- 现有 `MCP` 列表、详情、开关、编辑、Profile 应用，逐步切换到项目内部副本作为业务主数据源。

**方案**
- 采用双层存储：
  - `Config Snapshot Store`：保存四个逻辑配置源的文本快照、当前哈希、忽略基线和最近检查时间，用于启动检测、手动检测和差异展示。
  - `MCP Registry`：仅保存 `MCP` 的结构化内部副本，作为项目内部唯一业务数据源。
- `Skill` 只进入 `Config Snapshot Store`，不进入 `MCP Registry`。
- 启动时在 `App.tsx` 首次加载阶段调用聚合检查命令；手动检查按钮复用同一命令。
- 检测到变化后弹出统一对话框，按文件分组展示 `before/after` 文本与 `unified diff`，默认使用现有 `DiffViewer` 的 split 视图。
- `MCP` 变化提供 `确认更新 MCP` 和 `忽略本次变化`；`Skill` 只参与展示和忽略，不提供同步到内部副本的动作。
- 用户点击 `确认更新 MCP` 时，只更新 `MCP Registry` 和对应 source 的已知快照状态，不反向覆盖外部文件。
- 用户点击 `忽略本次变化` 时，将当前外部文本哈希记录为 `ignored_text_hash`；之后同一版本不再提示，直到再次出现新变化。

**状态机**
- `Clean`：当前文本与项目已知状态一致，无提示。
- `ChangedPendingReview`：检测到新变化，等待用户确认或忽略。
- `IgnoredBaseline`：用户已忽略当前版本；下次检测若哈希不变则不再提示。
- `AcceptedForMcp`：用户已确认同步，`MCP Registry` 已更新。
- 状态迁移：
  - `Clean -> ChangedPendingReview`
  - `ChangedPendingReview -> IgnoredBaseline`
  - `ChangedPendingReview -> AcceptedForMcp`（仅 `MCP`）
  - `IgnoredBaseline -> ChangedPendingReview`（外部文本再次变化）

**UI 设计**
- 启动或手动检测发现变化时，先提示：`检测到外部配置文件已更新`。
- 使用一个统一对话框展示本次所有变化，不做多弹窗串行打断。
- 对话框包含三部分：
  - 概览区：按文件列出 `MCP/Skill`、客户端、变化类型、是否需要确认同步。
  - 详情区：按文件切换查看 diff，默认 `对比视图`，保留 `统一视图` 和 `自动换行`。
  - 操作区：提供 `确认更新 MCP`、`忽略本次变化`、`关闭`。
- `手动检查更新` 按钮放在 `ServersPage` 顶部工具栏，复用相同检测逻辑。

**内部存储**
- 在 `app_local_data_dir` 下新增：
  - `mcp_registry.json`
  - `config_snapshots.json`
- `mcp_registry.json` 负责保存：
  - `server_id`
  - `client`
  - `name`
  - `transport`
  - `enabled`
  - `payload`
  - `source_origin`
  - `updated_at`
- `config_snapshots.json` 负责保存：
  - `source_id`
  - `kind`
  - `client`
  - `external_path`
  - `last_seen_text`
  - `last_seen_text_hash`
  - `ignored_text_hash`
  - `last_checked_at`

**写回规则**
- `MCP` 启用：从 `MCP Registry` 读取配置并追加写入外部配置文件。
- `MCP` 禁用：只更新 `MCP Registry.enabled = false`，同时从外部配置文件移除对应条目。
- `MCP` 编辑：
  - 永远先更新 `MCP Registry`。
  - 若当前为启用状态，再同步改写外部配置文件。
  - 若当前为禁用状态，只改内部副本，不改外部文件。
- `MCP` 新增：先进入 `MCP Registry`；若默认启用，再追加写入外部文件。
- 检测到外部 `MCP` 变化但用户未确认时，内部副本保持不变，页面继续以内部副本为准。

**真实路径映射**
- UI 与检测结果使用四个逻辑配置源名称，便于理解和统一展示。
- 后端负责把逻辑源映射到当前真实存储：
  - `claudecode.mcp.json` -> `~/.claude.json`
  - `codex.mcp.json` -> `~/.codex/config.toml`
  - `claudecode.skill.json` -> `~/.claude/commands` + `commands_disabled`
  - `codex.skill.json` -> `~/.codex/skills` + `skills_disabled`

**模块改造**
- 前端：
  - `app-v2/src/App.tsx`
  - `app-v2/src/pages/ServersPage.tsx`
  - `app-v2/src/components/ConfigChangeDialog.tsx`（新增）
  - `app-v2/src/lib/api.ts`
  - `app-v2/src/lib/types.ts`
- 后端：
  - `app-v2/src-tauri/src/lib.rs`
  - `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
  - `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
  - `app-v2/src-tauri/crates/aidevhub-core/src/config_sync.rs`（新增）
  - `app-v2/src-tauri/crates/aidevhub-core/src/mcp_registry.rs`（新增）

**测试策略**
- 严格按 `TDD` 落地，先写失败测试，再做实现。
- 后端测试重点：
  - 启动检查 / 手动检查结果正确
  - `ignored_text_hash` 生效
  - `MCP` 确认同步只更新内部副本，不覆盖外部文件
  - `Skill` 只展示，不进入内部副本
  - `MCP` 启停 / 编辑 / 新增都以 `MCP Registry` 为源写回外部文件
- 前端测试重点：
  - `App` 启动自动触发检查
  - 检测到变化时显示统一提示和统一弹窗
  - 按文件分组展示 diff
  - `手动检查更新` 走同一检测链路
  - `确认更新 MCP` 与 `忽略本次变化` 调对接口

**不做**
- 不让 `Skill` 进入项目内部副本。
- 不在检测到外部 `MCP` 变化后自动覆盖 `MCP Registry`。
- 不为每个文件弹独立对话框。
- 不新增第二套 diff 展示组件，优先复用现有 `DiffViewer`。
