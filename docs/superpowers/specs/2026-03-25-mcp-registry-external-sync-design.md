# MCP 项目内副本与本地配置同步设计

**日期：** 2026-03-25

**目标**
- 在 `MCP管理` 页面中，为当前选中的客户端增加“检测项目内副本与本地配置差异”的显式入口。
- 在 `MCP管理` 页面中，为当前选中的客户端增加“将项目内维护的 MCP 配置写入本地文件”的显式入口。
- 写入时只覆盖当前客户端配置文件中的 `MCP` 配置段，保留其他非 `MCP` 内容不变。
- 新增独立 `设置` 页面，用于持久化控制“检测后直接打开差异”还是“仅提示结果”。

**范围**
- 新增一个 `设置` 路由与对应页面。
- 新增一份应用级偏好文件，用于保存 `MCP` 差异检测展示方式。
- 为 `ServersPage` 增加两个仅作用于当前客户端的按钮：
  - `检测项目与本地差异`
  - `写入项目内 MCP 到本地`
- 后端新增“项目内副本 vs 本地文件 MCP 段”的检测、预览与应用命令。
- 复用现有 `WritePreviewDialog`、文件前置校验与备份链路。

**现状约束**
- 当前业务主数据源已经是项目内部的 `mcp_registry.json`。
- 常规 `MCP` 新增、编辑、启停、Profile 应用，已经会从内部注册表导出当前客户端配置并写回本地文件。
- 现有 `手动检查更新` / `ConfigChangeDialog` 流程只处理“外部文件变化 -> 是否同步到项目内部副本”，不能混用为本次新功能的展示容器。
- 当前应用没有通用设置页，也没有现成的应用偏好持久化结构。

**方案**
- 保持双向流程分离：
  - 旧流程：外部文件为主，检测外部变化并决定是否导入项目内副本。
  - 新流程：项目内副本为主，检测项目内副本导出结果与本地文件当前 `MCP` 配置段的差异，并允许显式回写。
- 新流程只按当前选中的 `client` 工作，不支持一次同时处理两个客户端。
- 后端继续复用现有导出逻辑，避免新增第二套 `Claude/Codex` 配置生成代码。
- 前端为新流程维护独立状态，不并入 `config updates` 状态机。

**UI 设计**
- 侧边栏新增 `设置` 页面，页面初期只放一项：
  - `MCP 差异检测结果展示方式`
  - 可选值：
    - `直接打开差异`
    - `仅提示结果`
- `MCP管理` 页面顶部工具栏新增两个按钮：
  - `检测项目与本地差异`
  - `写入项目内 MCP 到本地`
- 以上两个按钮只作用于当前 `client` 下拉选择值。
- `检测项目与本地差异` 点击后：
  - 若设置为 `直接打开差异`，直接展示 diff 对话框。
  - 若设置为 `仅提示结果`，只展示“有差异 / 无差异”的结果；如果有差异，再提供 `查看差异` 入口。
- `写入项目内 MCP 到本地` 点击后：
  - 永远先展示写入预览。
  - 用户确认后才落盘。

**偏好存储**
- 在 `app_local_data_dir` 下新增 `app_settings.json`。
- 文件初期只保存一个字段：
  - `mcp_diff_check_mode`
- 建议值定义：
  - `open_diff`
  - `summary_only`
- 启动时前端读取设置；用户在 `设置` 页面修改后立即保存。

**后端命令**
- 新增 `settings_get`
  - 返回当前应用偏好；文件不存在时返回默认值。
- 新增 `settings_put`
  - 保存应用偏好。
- 新增 `mcp_check_registry_external_diff(client)`
  - 以项目内部 `mcp_registry` 为源，生成当前客户端导出配置。
  - 读取本地当前客户端配置文件，并仅提取 `MCP` 配置段进行比较。
  - 返回：
    - `client`
    - `target_path`
    - `has_diff`
    - `diff_unified`
    - `before_fragment`
    - `after_fragment`
- 新增 `mcp_preview_sync_registry_to_external(client)`
  - 生成当前客户端本地配置文件的写入预览。
  - 预览只包含当前客户端配置文件，不涉及 `mcp_registry.json`。
- 新增 `mcp_apply_sync_registry_to_external(client, expected_files)`
  - 基于预览时的前置条件应用写回。
  - 继续复用现有 `ApplyResult`、备份与冲突检测链路。

**数据流**
- 差异检测：
  - 读取当前客户端本地配置文件。
  - 从 `mcp_registry` 导出当前客户端完整目标配置。
  - 从本地文件中解析并提取 `MCP` 配置段。
  - 从导出结果中提取目标 `MCP` 配置段。
  - 对比两个片段，生成统一 diff。
- 写入预览：
  - 读取当前客户端本地配置文件。
  - 保留文件中所有非 `MCP` 内容。
  - 用项目内导出的目标 `MCP` 配置段替换原文件中的 `MCP` 配置段。
  - 生成单文件预览与预期哈希。
- 应用写入：
  - 校验预期文件哈希未变化。
  - 原子写入目标文件。
  - 产出备份记录。

**片段级写回规则**
- `Claude Code`
  - 只替换 JSON 根对象中的 `mcpServers` 字段。
  - 保留同级其他字段不变。
- `Codex`
  - 只替换 TOML 文档中的 `mcp_servers` 表。
  - 保留其他顶级字段、表和注释位置上的现有整体结构尽可能不变。
- 若目标文件不存在：
  - 按“空文件”处理。
  - 导出结果中的 `MCP` 配置段将成为写入内容。

**错误处理**
- 本地配置文件不存在：
  - 检测时按空 `MCP` 段处理。
  - 若项目内存在 `MCP`，则视为有差异。
- 本地配置文件格式损坏：
  - 检测与写回都直接返回解析错误。
  - 不做自动修复，因为无法在不破坏非 `MCP` 内容的前提下安全回写。
- 预览后文件被修改：
  - `apply` 阶段返回前置条件失败，提示重新生成预览。
- 新流程执行成功后：
  - 刷新当前 `MCP` 列表。
  - 不触发旧的外部变更检测弹窗，以避免双重提示。

**前端模块改造**
- `app-v2/src/App.tsx`
  - 增加设置数据加载与保存。
  - 增加新差异检测/写回流程的独立状态。
- `app-v2/src/components/AppShell.tsx`
  - 新增 `settings` 路由。
- `app-v2/src/pages/ServersPage.tsx`
  - 增加两个新按钮与相关回调。
- `app-v2/src/pages/SettingsPage.tsx`（新增）
  - 展示并修改 `mcp_diff_check_mode`。
- `app-v2/src/components/McpConfigDiffDialog.tsx`（新增）
  - 展示“项目内副本 vs 本地文件 MCP 段”的 diff。
- `app-v2/src/components/McpConfigDiffSummaryDialog.tsx`（新增）
  - 在 `summary_only` 模式下展示结果摘要与“查看差异”入口。
- `app-v2/src/lib/api.ts`
  - 新增 settings / mcp sync 相关接口。
- `app-v2/src/lib/types.ts`
  - 新增设置与差异检测 DTO。

**后端模块改造**
- `app-v2/src-tauri/src/lib.rs`
  - 暴露新 tauri 命令。
- `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
  - 新增 settings 与 mcp diff DTO。
- `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
  - 抽出“仅替换 MCP 配置段”的片段级生成与写回能力。
- `app-v2/src-tauri/crates/aidevhub-core/src/app_settings.rs`（新增）
  - 读取与写入 `app_settings.json`。
- `app-v2/src-tauri/crates/aidevhub-core/src/config_sync.rs`
  - 保持旧流程职责不变，不并入本次新功能。

**测试策略**
- 严格按 `TDD` 落地，先写失败测试，再做最小实现。
- 后端测试重点：
  - `Claude Code` 仅比较和替换 `mcpServers`。
  - `Codex` 仅比较和替换 `mcp_servers`。
  - 写回后保留非 `MCP` 内容不变。
  - 本地文件不存在时可正常检测和预览。
  - 本地文件格式损坏时返回解析错误。
  - 预览后文件变化时 `apply` 返回前置条件失败。
- 前端测试重点：
  - 侧边栏新增 `设置` 页面入口。
  - `设置` 页面能读取和保存 `mcp_diff_check_mode`。
  - `MCP管理` 页新增两个按钮。
  - 不同设置值下，检测按钮触发不同展示行为。
  - 写入按钮走预览 -> 确认 -> 刷新链路。
  - 新流程不影响既有 `ConfigChangeDialog` 行为。

**不做**
- 不把本次偏好扩展成完整通用设置框架。
- 不让新流程复用旧的“外部配置变更检测”对话框。
- 不支持一次同时比较或写回两个客户端。
- 不在文件解析失败时尝试自动修复或部分写入。
- 不改变现有“外部文件 -> 项目内副本”的交互语义。
