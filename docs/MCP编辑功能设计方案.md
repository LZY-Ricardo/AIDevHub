# AIDevHub MCP 编辑功能设计方案

文档状态: 已实现（历史设计稿）
版本: v1.0
日期: 2026-03-21

> 归档说明：MCP 编辑功能已于 2026-03-21 落地。本文保留为历史设计记录，当前行为与接口以 `README.md`、`docs/技术实现方案文档.md`、`docs/接口文档.md` 及代码实现为准。

## 1. 背景与目标

本文编写时，AIDevHub 已支持 MCP server 的列表展示、启用/禁用、新增、Profile 切换、diff 预览、备份与回滚，但尚不支持在应用内直接编辑已有 MCP server 的配置内容；该能力现已按本文方案主体落地。

这带来两个明显问题：

- 用户仍需回到原始配置文件手动修改已有 server，破坏了产品的统一管理目标
- 现有“安全写入流”只覆盖新增与开关，未覆盖“修改已有配置”这一高频场景

本方案目标是在不破坏现有架构原则的前提下，为 Claude Code 与 Codex 的 MCP server 增加“编辑现有 server”能力，并继续沿用现有的安全模型：

- 先预览再写入
- 最小破坏
- 自动备份
- 支持回滚
- 未知字段尽量保留

## 2. 范围与非目标

### 2.1 本次设计范围

- 在 `Servers` 详情抽屉内增加“编辑”入口
- 支持两种编辑方式：
  - 结构化表单编辑
  - 高级模式下的当前 server 原始片段编辑
- 统一走 `preview -> apply -> backup` 写入流
- 支持 Claude Code 与 Codex 两类客户端
- 保留当前 server 中前端不识别的附加字段

### 2.2 明确不做

- 不支持编辑整份配置文件
- 不支持在编辑中修改 `server_id`
- 不支持在编辑中切换 transport 类型
- 不用编辑功能替代现有 toggle 逻辑
- 不引入持久化草稿箱
- 不做 IDE 级配置编辑器能力

## 3. 关键决策记录

1. 第一版采用“双模式编辑”：默认结构化表单 + 高级模式原始片段
2. 高级模式仅允许编辑“当前 MCP 片段”，不允许编辑整份配置文件
3. 两种模式共享同一份工作副本，不维护两套独立状态
4. 前端统一编辑 JSON 结构化片段；后端负责写回 Claude JSON 或 Codex TOML
5. 保存仍然必须经过 `preview -> apply`，不允许直接落盘
6. 第一版不支持改名，不支持 transport 迁移
7. Claude 的启用/禁用继续通过 disabled pool 机制处理，不在编辑流程中混入

## 4. 设计原则

### 4.1 KISS

- 复用现有 `Servers -> DetailsDrawer -> WritePreviewDialog` 主流程
- 不增加新页面，直接在现有详情抽屉中进入编辑态
- 前端只有一个标准草稿模型，后端只有一条编辑写入通路

### 4.2 YAGNI

- 只解决“编辑当前 server”的核心需求
- 第一版不扩展到整文件编辑、批量编辑或项目级配置
- 不为了未来可能的 transport 扩展提前抽象过度复杂的编辑 DSL

### 4.3 DRY

- 表单编辑与高级编辑最终统一成同一个 `draft.payload`
- `preview/apply/backup/diff/conflict protection` 完全复用现有写入基础设施

### 4.4 SOLID

- 前端负责编辑体验与草稿状态管理
- 后端负责字段规则、校验、最小改写和配置写回
- 编辑能力作为与 `toggle` / `add` 同级的新用例接入，不污染现有逻辑职责

## 5. 交互设计

## 5.1 入口位置

- 在 `Servers` 页面现有“详情”抽屉顶部新增 `编辑` 按钮
- 点击后，详情抽屉从“只读态”切换到“编辑态”
- 不新开独立页面，避免用户理解成本上升

## 5.2 编辑态布局

编辑态包含两个 tab：

- `基础编辑`
- `高级编辑`

二者编辑的是同一份工作副本：

- 在基础编辑修改后，切到高级编辑应看到同步后的片段
- 在高级编辑修改后，切回基础编辑时应尽可能回填表单字段
- 无法映射到表单的未知字段不会丢失

## 5.3 基础编辑

根据 `client + transport` 展示结构化表单字段：

- Claude + stdio
  - `command`
  - `args`
  - `env`
- Claude + http
  - `url`
  - `headers`
- Codex + stdio
  - `command`
  - `args`
  - `enabled`
- Codex + http
  - `url`
  - `bearer_token_env_var`
  - `enabled`

基础编辑区域额外展示：

- 来源客户端
- 来源文件
- transport 类型
- 未知字段提示

当存在表单无法表达但会保留的字段时，显示提示：

- “存在 N 个附加字段，保存时将保留；可在高级编辑中查看”

## 5.4 高级编辑

- 仅展示当前 server 的配置片段
- 不展示整份配置文件
- 编辑内容统一使用 JSON 结构化视图
- 用户修改的是同一份 `draft.payload`

这样可以避免前端同时暴露 JSON 与 TOML 两套语法编辑器，降低复杂度与学习成本。

## 5.5 保存与取消

保存流程：

- 编辑
- 生成预览
- 查看 diff
- 确认应用

取消流程：

- 不写入任何文件
- 丢弃本次会话的工作副本

## 6. 前端状态模型

建议新增编辑会话状态：

- `mode: "view" | "edit"`
- `editorTab: "form" | "raw"`
- `persistedDraft`
- `workingDraft`
- `dirty`
- `validation`
- `unknownFields`

其中：

- `persistedDraft` 表示后端返回的初始草稿
- `workingDraft` 表示当前正在编辑的草稿
- `dirty` 用于判断是否有未保存变更
- `validation` 存储前端轻校验结果
- `unknownFields` 用于提示有未映射字段存在

## 7. 数据模型设计

不建议直接复用当前 `ServerRecord.payload` 作为编辑输入，因为它更偏展示用途，且敏感值可能已被脱敏。

建议新增独立编辑会话模型：`ServerEditSession`

```ts
type ServerEditSession = {
  server_id: string;
  client: Client;
  transport: "stdio" | "http";
  source_file: string;
  editable_payload: Record<string, unknown>;
  raw_fragment_json: Record<string, unknown>;
  unknown_fields: string[];
  field_meta: FieldMeta;
};
```

```ts
type FieldMeta = {
  known_fields: string[];
  secret_fields: string[];
  readonly_fields: string[];
  available_fields: string[];
};
```

设计含义：

- `editable_payload` 供表单渲染和绑定
- `raw_fragment_json` 供高级编辑器直接编辑
- `unknown_fields` 用于 UI 提示未知字段
- `field_meta` 用于后端驱动表单渲染规则

## 8. 接口设计

建议新增 3 个命令，而不是复用现有展示态接口：

### 8.1 `server_get_edit_session`

用途：

- 打开编辑器时获取当前 server 的可编辑会话

请求：

```ts
{
  server_id: string;
}
```

响应：

```ts
ServerEditSession
```

### 8.2 `server_preview_edit`

用途：

- 基于当前草稿生成 diff 预览，不写入

请求：

```ts
{
  server_id: string;
  draft: {
    transport: "stdio" | "http";
    payload: Record<string, unknown>;
  };
}
```

响应：

```ts
WritePreview
```

### 8.3 `server_apply_edit`

用途：

- 基于预览结果执行最终写入

请求：

```ts
{
  server_id: string;
  draft: {
    transport: "stdio" | "http";
    payload: Record<string, unknown>;
  };
  expected_files: FilePrecondition[];
}
```

响应：

```ts
ApplyResult
```

## 9. 后端写回策略

建议新增内部能力：

```rust
plan_edit_server(paths, server_id, draft_payload) -> PlannedWrite
```

它与当前的 `plan_toggle`、`plan_add_server` 同级，统一输出 `PlannedWrite`，然后继续复用：

- `build_preview(...)`
- `apply_planned(...)`

这样编辑功能可天然继承：

- diff 预览
- `expected_files` 防竞态保护
- 自动备份
- 原子写入
- 出错回滚

### 9.1 Claude Code 写回策略

- 读取 `~/.claude.json`
- 定位 `mcpServers.<name>`
- 仅替换目标 server 对象
- 不改 `mcpServers` 之外的其它根字段
- 若 transport 为 `http`，后端自动维持 `type = "http"` 一致性
- 未知字段只要在草稿中仍然存在，就原样写回

### 9.2 Codex 写回策略

- 读取 `~/.codex/config.toml`
- 定位 `mcp_servers.<name>`
- 仅替换目标 table 的字段
- 不修改其它 `mcp_servers.*`
- 不修改非 `mcp_servers` 区域
- 继续基于 `toml_edit` 执行最小修改，尽量保留注释、空格和相对顺序

## 10. 草稿标准化策略

在进入 preview 前，后端对草稿做一次最小标准化：

- 清理 UI 临时字段，不写回配置
- 已知字段按最小规则标准化：
  - `command` 去首尾空白
  - `url` 去首尾空白
  - `args` 保证为字符串数组
  - `env` / `headers` 保证为 `Record<string, string>`
- 未知字段不主动删除

标准化的目标是“让配置可安全落盘”，而不是“把用户输入重塑成后端喜欢的结构”。

## 11. 值类型支持策略

### 11.1 Claude JSON

第一版允许当前 server 片段内保留任意 JSON 基本结构，只要配置整体仍是合法 JSON。

### 11.2 Codex TOML

第一版建议只保证以下类型的稳定写回：

- `string`
- `boolean`
- `number`
- `string[]`

对复杂嵌套对象、对象数组等 TOML 复杂结构：

- 若底层写回路径不稳定，则明确拒绝并返回校验错误

原因是当前 `plan_add_server` 对 Codex 的支持本身就以简单值类型为主，编辑能力不应在第一版超出当前稳定能力边界太多。

## 12. 校验规则

建议分为两层：

### 12.1 前端轻校验

用于提升交互体验：

- 必填字段为空
- JSON 片段解析失败
- `args` 中存在空行
- `env` / `headers` key 为空
- URL 格式明显非法

### 12.2 后端强校验

用于决定 preview/apply 是否允许继续：

#### 通用

- `server_id` 必须存在
- 不允许改名
- 不允许改 transport
- payload 必须为对象

#### stdio

- `command` 必填且非空
- `args` 若存在必须是字符串数组
- `env` 若存在必须是字符串 map

#### http

- `url` 必填且非空
- Claude:
  - `headers` 若存在必须是字符串 map
- Codex:
  - `bearer_token_env_var` 若存在必须是字符串

#### enabled

- 只在 Codex 编辑表单中暴露
- Claude 不通过编辑变更启用状态
- Claude 的启用/禁用仍然由现有 toggle + disabled pool 机制负责

## 13. 错误处理设计

建议统一归类以下错误：

### 13.1 `VALIDATION_ERROR`

用于用户输入问题：

- 字段缺失
- 类型错误
- JSON 片段非法
- Codex 不支持的复杂值类型

### 13.2 `NOT_FOUND`

用于目标 server 已不存在：

- server 被外部删除
- server 名称失效

### 13.3 `CONFLICT`

用于预览后配置已变化：

- `expected_files` 不匹配
- 用户需要重新获取最新编辑会话

### 13.4 `PARSE_ERROR` / `WRITE_ERROR`

用于配置文件无法解析或写回失败：

- 原配置损坏
- 写入失败
- 原子替换失败

前端处理建议：

- 预览失败：保留编辑草稿，不关闭抽屉
- 应用失败：保留预览与编辑上下文，允许修正后重试
- 冲突失败：提示重新加载编辑会话

## 14. 测试方案

建议测试分三层。

### 14.1 Rust 单元测试

重点覆盖 `plan_edit_server`

Claude：

- 编辑 stdio 的 `command / args / env`
- 编辑 http 的 `url / headers`
- 保留未知字段
- 不影响 `mcpServers` 之外的根字段

Codex：

- 编辑 stdio 的 `command / args / enabled`
- 编辑 http 的 `url / bearer_token_env_var / enabled`
- 只改目标 table
- 尽量保持其它 table 顺序不变
- 非法复杂类型时报错

### 14.2 前端单元测试

- 表单与高级模式共享草稿
- tab 切换不丢值
- 未知字段提示逻辑正确
- 高级编辑 JSON 非法时禁止预览

### 14.3 集成测试

- `server_get_edit_session -> server_preview_edit -> server_apply_edit` 全链路
- `expected_files` 冲突保护
- 写入后 `server_get` 能读取更新结果
- 备份记录正常生成
- 回滚后可恢复原配置

### 14.4 重点回归用例

- 编辑 Codex 某个 server，不影响相邻 `mcp_servers.*`
- 编辑 Claude 某个 server，不干扰 disabled pool 机制
- 高级编辑中包含未知字段，最终写入后依然保留

## 15. 分阶段落地建议

### 阶段 1

- 增加后端 `server_get_edit_session / server_preview_edit / server_apply_edit`
- 新增 `plan_edit_server`
- 在详情抽屉内接入“编辑”入口
- 完成基础编辑表单
- 完成高级模式 JSON 片段编辑
- 接入统一 diff 预览与 apply

### 阶段 2

- 优化未知字段提示
- 优化冲突与错误提示
- 完善高级编辑体验
- 补足前端与集成测试

## 16. 涉及文件建议

前端：

- `app-v2/src/pages/ServersPage.tsx`
- `app-v2/src/lib/api.ts`
- `app-v2/src/lib/types.ts`
- 可按需要新增编辑相关组件，例如：
  - `app-v2/src/components/ServerEditForm.tsx`
  - `app-v2/src/components/ServerRawEditor.tsx`

后端：

- `app-v2/src-tauri/src/lib.rs`
- `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs`

文档：

- `docs/接口文档.md`
- `docs/技术实现方案文档.md`
- `README.md`

## 17. 最终结论

本方案建议以“统一草稿 + 双模式编辑 + 单一 preview/apply 写入通路”的方式，为现有 MCP 管理增加编辑能力。

它具备以下优点：

- 与当前产品心智一致：仍然是列表 -> 详情 -> 编辑 -> 预览 -> 应用
- 与现有代码架构一致：复用 `PlannedWrite`、diff、备份、回滚与并发保护
- 风险可控：仅编辑当前 server 片段，不碰整文件编辑
- 扩展性良好：后续增加字段或 transport 支持时，主要扩展 schema 与映射逻辑

第一版明确边界如下：

- 支持结构化表单编辑
- 支持高级模式下的当前 server 原始片段编辑
- 不支持改名
- 不支持切换 transport
- 不支持整文件编辑

在 MVP 约束下，这是最符合现有工程原则、用户体验与实现成本平衡的方案。
