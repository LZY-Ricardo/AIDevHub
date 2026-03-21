# MCP编辑功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 MCP server 增加详情抽屉内编辑能力，支持结构化表单与高级 JSON 片段双模式，并继续沿用 `preview -> apply -> backup` 安全写入流。

**Architecture:** 后端在现有 `toggle/add/profile` 写入体系旁新增 `get_edit_session / preview_edit / apply_edit` 三条编辑能力，并通过 `plan_edit_server` 复用 `PlannedWrite`、diff、备份与原子写入。前端在 `ServersPage` 详情抽屉内扩展编辑态，使用统一 `workingDraft` 作为表单与高级编辑器的共享状态。

**Tech Stack:** React 19、TypeScript、Tauri v2、Rust、serde_json、toml_edit、node:test、cargo test

---

> 说明：遵循仓库内指令，本计划不预设 `git commit` 或分支操作；仅提供实现、测试与文档更新步骤。

## 文件职责映射

- `app-v2/src/pages/ServersPage.tsx`
  - 详情抽屉切换到编辑态
  - 管理 `view/edit`、`form/raw`、`persistedDraft/workingDraft`、预览与应用
- `app-v2/src/components/ServerEditForm.tsx`
  - 渲染结构化表单字段
  - 处理已知字段编辑与未知字段提示
- `app-v2/src/components/ServerRawEditor.tsx`
  - 渲染高级 JSON 片段编辑区
  - 负责 JSON 解析错误展示
- `app-v2/src/lib/types.ts`
  - 新增编辑会话、字段元信息、编辑请求/响应类型
- `app-v2/src/lib/api.ts`
  - 新增 `serverGetEditSession`、`serverPreviewEdit`、`serverApplyEdit`
- `app-v2/src-tauri/src/lib.rs`
  - 暴露新的 Tauri commands
- `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
  - 新增 Rust 侧编辑会话与编辑草稿模型
- `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
  - 新增 `server_get_edit_session`
  - 新增 `plan_edit_server`
  - 新增 `server_preview_edit / server_apply_edit`
  - 新增字段标准化与校验逻辑
- `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs`
  - 覆盖后端编辑会话与写回逻辑
- `app-v2/tests/servers-page-editing.test.mjs`
  - 覆盖编辑态 UI 与 API 接线的静态回归测试
- `docs/接口文档.md`
  - 补充编辑相关接口
- `docs/技术实现方案文档.md`
  - 更新能力范围与写回策略
- `README.md`
  - 更新功能列表与实现范围

### Task 1: 建立后端编辑会话模型与读取能力

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`
- Test: `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs`

- [ ] **Step 1: 写后端失败测试，定义编辑会话返回形状**

```rust
#[test]
fn server_get_edit_session_returns_editable_payload_for_claude() {
    let dir = tempdir().unwrap();
    let paths = fixture_paths(dir.path());
    write(&paths.claude_config_path, r#"{
      "mcpServers": {
        "demo": {
          "command": "npx",
          "args": ["-y", "@demo/server"],
          "env": {"API_KEY": "secret"},
          "x_extra": "keep-me"
        }
      }
    }"#).unwrap();

    let session = server_get_edit_session(&paths, "claude_code:demo").unwrap();
    assert_eq!(session.server_id, "claude_code:demo");
    assert!(session.unknown_fields.contains(&"x_extra".to_string()));
    assert_eq!(
        session.raw_fragment_json.get("command").and_then(|v| v.as_str()),
        Some("npx")
    );
}
```

- [ ] **Step 2: 运行测试，确认新接口尚未实现**

Run: `cargo test -p aidevhub-core --test ops server_get_edit_session_returns_editable_payload_for_claude -- --exact`

Expected: FAIL，提示 `server_get_edit_session` 未定义或返回类型不存在

- [ ] **Step 3: 在 Rust 模型层补充编辑会话结构**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerFieldMeta {
    pub known_fields: Vec<String>,
    pub secret_fields: Vec<String>,
    pub readonly_fields: Vec<String>,
    pub available_fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEditSession {
    pub server_id: String,
    pub client: Client,
    pub transport: Transport,
    pub source_file: String,
    pub editable_payload: serde_json::Map<String, serde_json::Value>,
    pub raw_fragment_json: serde_json::Map<String, serde_json::Value>,
    pub unknown_fields: Vec<String>,
    pub field_meta: ServerFieldMeta,
}
```

- [ ] **Step 4: 实现 `server_get_edit_session` 与 Tauri command**

```rust
pub fn server_get_edit_session(paths: &AppPaths, server_id_str: &str) -> Result<ServerEditSession, AppError> {
    let record = server_get(paths, server_id_str, true)?;
    let field_meta = server_field_meta(record.client, record.transport);
    let unknown_fields = record
        .payload
        .keys()
        .filter(|key| !field_meta.known_fields.iter().any(|known| known == *key))
        .cloned()
        .collect::<Vec<_>>();

    Ok(ServerEditSession {
        server_id: record.server_id,
        client: record.client,
        transport: record.transport,
        source_file: record.source_file,
        editable_payload: record.payload.clone(),
        raw_fragment_json: record.payload,
        unknown_fields,
        field_meta,
    })
}
```

- [ ] **Step 5: 运行测试，确认编辑会话能力通过**

Run: `cargo test -p aidevhub-core --test ops server_get_edit_session_returns_editable_payload_for_claude -- --exact`

Expected: PASS

### Task 2: 为 Claude 编辑流程增加 preview/apply 写回

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`
- Test: `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs`

- [ ] **Step 1: 写 Claude 编辑预览与应用失败测试**

```rust
#[test]
fn claude_edit_preview_and_apply_updates_only_target_server() {
    let dir = tempdir().unwrap();
    let paths = fixture_paths(dir.path());
    write(&paths.claude_config_path, r#"{
      "theme": "dark",
      "mcpServers": {
        "demo": {"command": "old", "args": ["a"], "x_extra": "keep"},
        "other": {"command": "stay"}
      }
    }"#).unwrap();

    let mut payload = serde_json::Map::new();
    payload.insert("command".into(), json!("new"));
    payload.insert("args".into(), json!(["b"]));
    payload.insert("x_extra".into(), json!("keep"));

    let preview = server_preview_edit(&paths, "claude_code:demo", Transport::Stdio, payload.clone()).unwrap();
    assert!(preview.files[0].diff_unified.contains("\"command\": \"new\""));

    server_apply_edit(
        &paths,
        "claude_code:demo",
        Transport::Stdio,
        payload,
        preconditions_from_preview(&preview),
    ).unwrap();

    let cfg = read_to_string(&paths.claude_config_path).unwrap();
    assert!(cfg.contains("\"theme\": \"dark\""));
    assert!(cfg.contains("\"command\": \"new\""));
    assert!(cfg.contains("\"other\": {\"command\": \"stay\"}"));
}
```

- [ ] **Step 2: 运行测试，确认 Claude 编辑流程未实现**

Run: `cargo test -p aidevhub-core --test ops claude_edit_preview_and_apply_updates_only_target_server -- --exact`

Expected: FAIL，提示 `server_preview_edit` / `server_apply_edit` 未定义

- [ ] **Step 3: 增加编辑草稿模型并实现 `plan_edit_server` 的 Claude 分支**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEditDraft {
    pub transport: Transport,
    pub payload: serde_json::Map<String, serde_json::Value>,
}

fn plan_edit_server(
    paths: &AppPaths,
    server_id_str: &str,
    draft: ServerEditDraft,
) -> Result<PlannedWrite, CoreError> {
    let (client, name) = parse_server_id(server_id_str)?;
    match client {
        Client::ClaudeCode => {
            let (root, mut servers) = parse_claude_config(&paths.claude_config_path)?;
            let existing = servers
                .get(&name)
                .ok_or_else(|| CoreError::NotFound(format!("server not found: {server_id_str}")))?;
            let transport = detect_transport(existing, client);
            if transport != draft.transport {
                return Err(CoreError::Validation("transport cannot change".into()));
            }
            let normalized = normalize_server_payload(client, draft.transport, draft.payload)?;
            servers.insert(name, serde_json::Value::Object(normalized));
            Ok(build_server_edit_planned(paths, BackupOp::AddServer, write_claude_config(root, servers)?))
        }
        Client::Codex => unreachable!("codex handled in task 3"),
    }
}
```

- [ ] **Step 4: 实现 `server_preview_edit` 与 `server_apply_edit` 的 Claude 通路**

```rust
pub fn server_preview_edit(
    paths: &AppPaths,
    server_id_str: &str,
    transport: Transport,
    payload: serde_json::Map<String, serde_json::Value>,
) -> Result<WritePreview, AppError> {
    let planned = plan_edit_server(paths, server_id_str, ServerEditDraft { transport, payload })
        .map_err(AppError::from)?;
    build_preview(planned).map_err(AppError::from)
}
```

- [ ] **Step 5: 运行 Claude 编辑测试**

Run: `cargo test -p aidevhub-core --test ops claude_edit_preview_and_apply_updates_only_target_server -- --exact`

Expected: PASS

### Task 3: 为 Codex 编辑流程补齐最小改写与类型校验

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
- Modify: `app-v2/src-tauri/src/lib.rs`
- Test: `app-v2/src-tauri/crates/aidevhub-core/tests/ops.rs`

- [ ] **Step 1: 写 Codex 编辑成功与复杂类型拒绝测试**

```rust
#[test]
fn codex_edit_updates_only_target_table_and_preserves_neighbors() {
    let dir = tempdir().unwrap();
    let paths = fixture_paths(dir.path());
    write(&paths.codex_config_path, r#"
[mcp_servers.alpha]
command = "old"
args = ["a"]
enabled = true

[mcp_servers.beta]
url = "https://keep.example.com/mcp"
enabled = false
"#).unwrap();

    let mut payload = serde_json::Map::new();
    payload.insert("command".into(), json!("new"));
    payload.insert("args".into(), json!(["b"]));
    payload.insert("enabled".into(), json!(false));

    let preview = server_preview_edit(&paths, "codex:alpha", Transport::Stdio, payload.clone()).unwrap();
    server_apply_edit(&paths, "codex:alpha", Transport::Stdio, payload, preconditions_from_preview(&preview)).unwrap();

    let cfg = read_to_string(&paths.codex_config_path).unwrap();
    assert!(cfg.contains("command = \"new\""));
    assert!(cfg.contains("[mcp_servers.beta]"));
    assert!(cfg.contains("url = \"https://keep.example.com/mcp\""));
}

#[test]
fn codex_edit_rejects_nested_object_values() {
    let dir = tempdir().unwrap();
    let paths = fixture_paths(dir.path());
    write(&paths.codex_config_path, r#"
[mcp_servers.alpha]
command = "old"
enabled = true
"#).unwrap();

    let mut payload = serde_json::Map::new();
    payload.insert("command".into(), json!("new"));
    payload.insert("nested".into(), json!({"bad": true}));

    let err = server_preview_edit(&paths, "codex:alpha", Transport::Stdio, payload).unwrap_err();
    assert_eq!(err.code, "VALIDATION_ERROR");
}
```

- [ ] **Step 2: 运行 Codex 编辑测试，确认失败**

Run: `cargo test -p aidevhub-core --test ops codex_edit_updates_only_target_table_and_preserves_neighbors -- --exact`

Expected: FAIL

- [ ] **Step 3: 实现 Codex 编辑分支、最小 table 改写与复杂类型校验**

```rust
fn apply_codex_payload_to_table(
    table: &mut Table,
    payload: serde_json::Map<String, serde_json::Value>,
) -> Result<(), CoreError> {
    table.clear();
    for (key, value) in payload {
        match value {
            serde_json::Value::String(v) => table[&key] = toml_edit::value(v),
            serde_json::Value::Bool(v) => table[&key] = toml_edit::value(v),
            serde_json::Value::Number(v) if v.is_i64() => table[&key] = toml_edit::value(v.as_i64().unwrap()),
            serde_json::Value::Number(v) if v.is_f64() => table[&key] = toml_edit::value(v.as_f64().unwrap()),
            serde_json::Value::Array(items) if items.iter().all(|item| item.is_string()) => {
                let mut arr = toml_edit::Array::new();
                for item in items {
                    arr.push(item.as_str().unwrap());
                }
                table[&key] = Item::Value(TomlValue::Array(arr));
            }
            _ => return Err(CoreError::Validation(format!("unsupported codex value type: {key}"))),
        }
    }
    Ok(())
}
```

- [ ] **Step 4: 运行整个 `ops` 集成测试文件，确认未破坏既有逻辑**

Run: `cargo test -p aidevhub-core --test ops`

Expected: PASS

### Task 4: 补前端类型、API 与编辑态外壳

**Files:**
- Modify: `app-v2/src/lib/types.ts`
- Modify: `app-v2/src/lib/api.ts`
- Modify: `app-v2/src/pages/ServersPage.tsx`
- Create: `app-v2/tests/servers-page-editing.test.mjs`

- [ ] **Step 1: 写前端静态回归测试，锁定编辑态入口与 API 接线**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/ServersPage.tsx', import.meta.url), 'utf8');

test('MCP 详情抽屉提供编辑按钮', () => {
  assert.match(source, /编辑/);
});

test('MCP 编辑态接入编辑会话 API', () => {
  assert.match(source, /serverGetEditSession/);
});

test('MCP 编辑态接入编辑预览 API', () => {
  assert.match(source, /serverPreviewEdit/);
});
```

- [ ] **Step 2: 运行前端静态测试，确认失败**

Run: `node --test app-v2/tests/servers-page-editing.test.mjs`

Expected: FAIL，提示页面尚未接入编辑功能

- [ ] **Step 3: 补充前端类型与 API 封装**

```ts
export interface ServerFieldMeta {
  known_fields: string[];
  secret_fields: string[];
  readonly_fields: string[];
  available_fields: string[];
}

export interface ServerEditSession {
  server_id: string;
  client: Client;
  transport: "stdio" | "http";
  source_file: string;
  editable_payload: Record<string, unknown>;
  raw_fragment_json: Record<string, unknown>;
  unknown_fields: string[];
  field_meta: ServerFieldMeta;
}
```

```ts
serverGetEditSession(payload: { server_id: string }): Promise<ServerEditSession> {
  return invokeCmd("server_get_edit_session", { serverId: payload.server_id });
},
serverPreviewEdit(payload: {
  server_id: string;
  draft: { transport: "stdio" | "http"; payload: Record<string, unknown> };
}): Promise<WritePreview> {
  return invokeCmd("server_preview_edit", {
    serverId: payload.server_id,
    transport: payload.draft.transport,
    payload: payload.draft.payload,
  });
},
```

- [ ] **Step 4: 在 `ServersPage` 中接入编辑态状态外壳**

```tsx
const [mode, setMode] = useState<"view" | "edit">("view");
const [editorTab, setEditorTab] = useState<"form" | "raw">("form");
const [editSession, setEditSession] = useState<ServerEditSession | null>(null);
const [workingDraft, setWorkingDraft] = useState<ServerEditDraft | null>(null);

async function startEdit(serverId: string) {
  const session = await api.serverGetEditSession({ server_id: serverId });
  setEditSession(session);
  setWorkingDraft({ transport: session.transport, payload: session.raw_fragment_json });
  setMode("edit");
}
```

- [ ] **Step 5: 运行前端静态测试**

Run: `node --test app-v2/tests/servers-page-editing.test.mjs`

Expected: PASS

### Task 5: 实现结构化表单与高级编辑器，并接入 preview/apply

**Files:**
- Create: `app-v2/src/components/ServerEditForm.tsx`
- Create: `app-v2/src/components/ServerRawEditor.tsx`
- Modify: `app-v2/src/pages/ServersPage.tsx`
- Test: `app-v2/tests/servers-page-editing.test.mjs`

- [ ] **Step 1: 扩展前端静态测试，锁定双 tab 与预览应用流**

```js
test('MCP 编辑态展示基础编辑标签', () => {
  assert.match(source, /基础编辑/);
});

test('MCP 编辑态展示高级编辑标签', () => {
  assert.match(source, /高级编辑/);
});

test('MCP 编辑态接入编辑应用 API', () => {
  assert.match(source, /serverApplyEdit/);
});
```

- [ ] **Step 2: 运行测试，确认双模式 UI 尚未落地**

Run: `node --test app-v2/tests/servers-page-editing.test.mjs`

Expected: FAIL

- [ ] **Step 3: 实现结构化表单组件**

```tsx
export function ServerEditForm({
  client,
  transport,
  payload,
  unknownFields,
  onChange,
}: ServerEditFormProps) {
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div className="ui-label">基础编辑</div>
      {transport === "stdio" ? (
        <input
          className="ui-input ui-code"
          value={String(payload.command ?? "")}
          onChange={(e) => onChange({ ...payload, command: e.currentTarget.value })}
        />
      ) : null}
      {unknownFields.length > 0 ? (
        <div className="ui-help">存在 {unknownFields.length} 个附加字段，保存时会保留，可在高级编辑中查看。</div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 实现高级 JSON 编辑器组件**

```tsx
export function ServerRawEditor({ payload, onChange }: ServerRawEditorProps) {
  const [text, setText] = useState(() => JSON.stringify(payload, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleBlur() {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "JSON 解析失败");
    }
  }

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div className="ui-label">高级编辑</div>
      <textarea className="ui-textarea ui-code" rows={18} value={text} onChange={(e) => setText(e.currentTarget.value)} onBlur={handleBlur} />
      {error ? <div className="ui-error">{error}</div> : null}
    </div>
  );
}
```

- [ ] **Step 5: 将编辑态接入预览与应用**

```tsx
async function requestEditPreview() {
  if (!selected || !workingDraft) return;
  const p = await api.serverPreviewEdit({
    server_id: selected.server_id,
    draft: workingDraft,
  });
  setPreviewTitle(`编辑MCP：${selected.server_id}`);
  setPreview(p);
  setPreviewOpen(true);
}

async function applyEdit(expected_files: FilePrecondition[]) {
  if (!selected || !workingDraft) return;
  await api.serverApplyEdit({
    server_id: selected.server_id,
    draft: workingDraft,
    expected_files,
  });
  setMode("view");
  await load();
}
```

- [ ] **Step 6: 运行前端静态测试与构建检查**

Run: `node --test app-v2/tests/servers-page-editing.test.mjs app-v2/tests/servers-page-identifier.test.mjs`

Expected: PASS

Run: `npm run build`

Workdir: `app-v2`

Expected: build 成功，`tsc` 和 `vite build` 无报错

### Task 6: 更新文档并完成最终验证

**Files:**
- Modify: `docs/接口文档.md`
- Modify: `docs/技术实现方案文档.md`
- Modify: `README.md`

- [ ] **Step 1: 补充接口文档中的编辑能力**

```md
#### `server_get_edit_session`

用途：打开编辑器时获取当前 server 的可编辑会话。

#### `server_preview_edit`

用途：基于编辑草稿生成 diff 预览，不写入。

#### `server_apply_edit`

用途：执行编辑写入，走备份与原子落盘流程。
```

- [ ] **Step 2: 更新技术方案与 README 的能力描述**

```md
- Servers 页支持编辑已有 MCP
- 编辑模式包括基础编辑与高级片段编辑
- 编辑仍然遵循 `preview -> apply -> backup`
```

- [ ] **Step 3: 执行最终验证**

Run: `cargo test -p aidevhub-core --test ops`

Workdir: `app-v2/src-tauri`

Expected: PASS

Run: `node --test app-v2/tests/servers-page-editing.test.mjs app-v2/tests/servers-page-identifier.test.mjs`

Expected: PASS

Run: `npm run build`

Workdir: `app-v2`

Expected: PASS

- [ ] **Step 4: 人工验收检查清单**

```md
- 详情抽屉可进入编辑态
- 基础编辑与高级编辑可切换
- 未知字段有提示且不会丢失
- 预览 diff 正确只反映目标 server 变更
- Claude 编辑不影响 disabled pool
- Codex 编辑不改相邻 table
```
