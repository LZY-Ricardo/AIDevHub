# MCP 健康检测功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add health check functionality to verify MCP server connectivity from the AIDevHub desktop app.

**Architecture:** Rust backend spawns child processes (stdio) or makes HTTP requests to perform MCP `initialize` + `ping` handshake. Results returned via Tauri IPC commands. Frontend renders inline progress indicators in the server list table.

**Tech Stack:** Rust (tokio process::Command, reqwest for HTTP), TypeScript/React (Tauri invoke)

---

### Task 1: Add Health Check data models

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs` (append after line 312)
- Modify: `app-v2/src/lib/types.ts` (append before end of file)

- [ ] **Step 1: Add Rust models**

Append to `app-v2/src-tauri/crates/aidevhub-core/src/model.rs` after the `McpRegistryExternalDiff` struct:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Checking,
    Ok,
    Fail,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckResult {
    pub server_id: String,
    pub status: HealthStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub checked_at: String,
}
```

- [ ] **Step 2: Add TypeScript types**

Append to `app-v2/src/lib/types.ts` before the end of file:

```typescript
export type HealthStatus = "checking" | "ok" | "fail" | "timeout";

export interface HealthCheckResult {
  server_id: string;
  status: HealthStatus;
  latency_ms?: number;
  error?: string;
  checked_at: string;
}
```

- [ ] **Step 3: Verify Rust compilation**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2/src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` without errors

- [ ] **Step 4: Commit**

```bash
git add app-v2/src-tauri/crates/aidevhub-core/src/model.rs app-v2/src/lib/types.ts
git commit -m "feat(health-check): add HealthStatus and HealthCheckResult models"
```

---

### Task 2: Implement stdio health check core logic

**Files:**
- Create: `app-v2/src-tauri/crates/aidevhub-core/src/health_check.rs`
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/lib.rs` (add module export)
- Modify: `app-v2/src-tauri/crates/aidevhub-core/Cargo.toml` (add tokio dependency)

- [ ] **Step 1: Add tokio dependency**

In `app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`, add to `[dependencies]`:

```toml
tokio = { version = "1", features = ["process", "io-util", "time", "rt"] }
```

- [ ] **Step 2: Create health_check.rs module**

Create `app-v2/src-tauri/crates/aidevhub-core/src/health_check.rs`:

```rust
use std::collections::BTreeMap;
use std::process::Stdio;
use std::time::Instant;

use chrono::Utc;
use serde_json::{json, Map, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::mcp_registry::{self, McpRegistryServer};
use crate::model::{AppError, Client, HealthCheckResult, HealthStatus};
use crate::ops::AppPaths;

const STEP_TIMEOUT_SECS: u64 = 5;
const TOTAL_TIMEOUT_SECS: u64 = 15;
const MAX_CONCURRENT: usize = 5;

pub fn check_single(
    paths: &AppPaths,
    server_id: &str,
) -> Result<HealthCheckResult, AppError> {
    let server = mcp_registry::get_registry_server(paths, server_id)?
        .ok_or_else(|| AppError::new("NOT_FOUND", format!("server not found: {server_id}")))?;

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("tokio runtime: {e}")))?;
    rt.block_on(check_server(&server))
}

pub fn check_all(
    paths: &AppPaths,
    client: Client,
) -> Result<Vec<HealthCheckResult>, AppError> {
    let servers = mcp_registry::list_registry_servers(paths, Some(client))?;
    let enabled: Vec<_> = servers.into_iter().filter(|s| s.enabled).collect();

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("tokio runtime: {e}")))?;

    rt.block_on(async {
        let semaphore = tokio::sync::Semaphore::new(MAX_CONCURRENT);
        let mut handles = Vec::new();

        for server in enabled {
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            handles.push(tokio::spawn(async move {
                let result = check_server(&server).await;
                drop(permit);
                result
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(result) => results.push(result),
                Err(e) => results.push(HealthCheckResult {
                    server_id: String::new(),
                    status: HealthStatus::Fail,
                    latency_ms: None,
                    error: Some(format!("task join error: {e}")),
                    checked_at: now_iso(),
                }),
            }
        }
        Ok(results)
    })
}

async fn check_server(server: &McpRegistryServer) -> HealthCheckResult {
    let start = Instant::now();
    let checked_at = now_iso();

    let result = match server.transport {
        crate::model::Transport::Stdio => check_stdio(&server.payload).await,
        crate::model::Transport::Http => check_http(&server.payload).await,
        crate::model::Transport::Unknown => Err("unknown transport type".to_string()),
    };

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(()) => HealthCheckResult {
            server_id: server.server_id.clone(),
            status: HealthStatus::Ok,
            latency_ms: Some(latency_ms),
            error: None,
            checked_at,
        },
        Err(msg) => HealthCheckResult {
            server_id: server.server_id.clone(),
            status: if msg.contains("timeout") || msg.contains("Timeout") {
                HealthStatus::Timeout
            } else {
                HealthStatus::Fail
            },
            latency_ms: Some(latency_ms),
            error: Some(msg),
            checked_at,
        },
    }
}

async fn check_stdio(payload: &Map<String, Value>) -> Result<(), String> {
    let command = payload
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing 'command' field".to_string())?
        .to_string();

    let args: Vec<String> = payload
        .get("args")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut envs = Vec::new();
    if let Some(env_obj) = payload.get("env").and_then(Value::as_object) {
        for (k, v) in env_obj {
            if let Some(val) = v.as_str() {
                envs.push((k.clone(), val.to_string()));
            }
        }
    }

    let total = Duration::from_secs(TOTAL_TIMEOUT_SECS);
    timeout(total, async {
        let mut cmd = Command::new(&command);
        cmd.args(&args)
            .envs(envs)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;

        let stdin = child.stdin.as_mut().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let mut reader = BufReader::new(stdout).lines();

        // Step 1: initialize
        let init_req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "aidevhub", "version": "1.0.0" }
            }
        });
        send_json_rpc(stdin, &init_req).await?;

        let init_resp = timeout(Duration::from_secs(STEP_TIMEOUT_SECS), read_response(&mut reader))
            .await
            .map_err(|_| "initialize timeout (5s)".to_string())?
            .map_err(|e| format!("initialize read error: {e}"))?;

        if init_resp.get("error").is_some() {
            let msg = init_resp["error"]["message"].as_str().unwrap_or("unknown");
            return Err(format!("initialize error: {msg}"));
        }

        // Step 2: initialized notification
        let notif = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        send_json_rpc(stdin, &notif).await?;

        // Step 3: ping
        let ping_req = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "ping"
        });
        send_json_rpc(stdin, &ping_req).await?;

        let ping_resp = timeout(Duration::from_secs(STEP_TIMEOUT_SECS), read_response(&mut reader))
            .await
            .map_err(|_| "ping timeout (5s)".to_string())?
            .map_err(|e| format!("ping read error: {e}"))?;

        if ping_resp.get("error").is_some() {
            let msg = ping_resp["error"]["message"].as_str().unwrap_or("unknown");
            return Err(format!("ping error: {msg}"));
        }

        // Cleanup
        let _ = child.kill().await;
        let _ = child.wait().await;
        Ok(())
    })
    .await
    .map_err(|_| "total timeout (15s)".to_string())?
}

async fn check_http(payload: &Map<String, Value>) -> Result<(), String> {
    let url = payload
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing 'url' field".to_string())?
        .to_string();

    let total = Duration::from_secs(TOTAL_TIMEOUT_SECS);
    timeout(total, async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(STEP_TIMEOUT_SECS))
            .build()
            .map_err(|e| format!("http client error: {e}"))?;

        // Step 1: initialize
        let init_req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "aidevhub", "version": "1.0.0" }
            }
        });

        let resp = client.post(&url)
            .json(&init_req)
            .send()
            .await
            .map_err(|e| format!("initialize request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("initialize HTTP {}", resp.status()));
        }

        let init_resp: Value = resp.json().await
            .map_err(|e| format!("initialize response parse error: {e}"))?;

        if init_resp.get("error").is_some() {
            let msg = init_resp["error"]["message"].as_str().unwrap_or("unknown");
            return Err(format!("initialize error: {msg}"));
        }

        // Step 2: ping
        let ping_req = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "ping"
        });

        let resp = client.post(&url)
            .json(&ping_req)
            .send()
            .await
            .map_err(|e| format!("ping request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("ping HTTP {}", resp.status()));
        }

        let ping_resp: Value = resp.json().await
            .map_err(|e| format!("ping response parse error: {e}"))?;

        if ping_resp.get("error").is_some() {
            let msg = ping_resp["error"]["message"].as_str().unwrap_or("unknown");
            return Err(format!("ping error: {msg}"));
        }

        Ok(())
    })
    .await
    .map_err(|_| "total timeout (15s)".to_string())?
}

async fn send_json_rpc(
    stdin: &mut tokio::process::ChildStdin,
    msg: &Value,
) -> Result<(), String> {
    let mut line = serde_json::to_string(msg).map_err(|e| format!("serialize error: {e}"))?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| format!("stdin write error: {e}"))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("stdin flush error: {e}"))?;
    Ok(())
}

async fn read_response(
    reader: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
) -> Result<Value, String> {
    while let Some(line) = reader
        .next_line()
        .await
        .map_err(|e| format!("stdout read error: {e}"))?
    {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Skip non-JSON lines (startup messages, etc.)
        if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
            // Only process responses (has "id") or errors
            if val.get("id").is_some() || val.get("error").is_some() {
                return Ok(val);
            }
            // Skip notifications (has "method" but no "id")
        }
    }
    Err("stdout closed before receiving response".to_string())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
```

- [ ] **Step 3: Add module export**

In `app-v2/src-tauri/crates/aidevhub-core/src/lib.rs`, add:

```rust
pub mod health_check;
```

- [ ] **Step 4: Add reqwest dependency**

In `app-v2/src-tauri/crates/aidevhub-core/Cargo.toml`, add to `[dependencies]`:

```toml
reqwest = { version = "0.12", features = ["json"] }
```

Note: reqwest with default-tls uses native-tls. This may need `openssl-dev` on Linux or we can use `rustls-tls` feature instead if native-tls is unavailable.

- [ ] **Step 5: Verify Rust compilation**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2/src-tauri && cargo check 2>&1 | tail -10`
Expected: `Finished` without errors (may need to adjust reqwest tls backend)

- [ ] **Step 6: Commit**

```bash
git add app-v2/src-tauri/crates/aidevhub-core/
git commit -m "feat(health-check): implement stdio and http health check core logic"
```

---

### Task 3: Register Tauri commands

**Files:**
- Modify: `app-v2/src-tauri/src/lib.rs` (add two command functions and register them)

- [ ] **Step 1: Add import and command functions**

In `app-v2/src-tauri/src/lib.rs`:

Add `HealthCheckResult` to the import from `aidevhub_core::model` (line 3-6):

```rust
use aidevhub_core::model::{
    AppError, AppSettings, Client, ConfigAcceptMcpResponse, ConfigCheckUpdatesResponse, ConfigIgnoreCondition,
    ConfigIgnoreUpdatesResponse, FilePrecondition, HealthCheckResult, McpRegistryExternalDiff, ProfileTargets, RuntimeGetInfoResponse,
    ServerNotes, Transport,
};
```

Add two new command functions before the `run()` function (before line 411):

```rust
#[tauri::command]
fn mcp_health_check(app: tauri::AppHandle, server_id: String) -> Result<HealthCheckResult, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::health_check::check_single(&paths, &server_id)
}

#[tauri::command]
fn mcp_health_check_all(app: tauri::AppHandle, client: Client) -> Result<Vec<HealthCheckResult>, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::health_check::check_all(&paths, client)
}
```

- [ ] **Step 2: Register commands in invoke_handler**

In the `tauri::generate_handler![]` macro (around line 423-458), add `mcp_health_check` and `mcp_health_check_all` to the list, after the `skill_apply_toggle` entry:

```rust
skill_apply_toggle,
mcp_health_check,
mcp_health_check_all
```

- [ ] **Step 3: Verify compilation**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2/src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` without errors

- [ ] **Step 4: Commit**

```bash
git add app-v2/src-tauri/src/lib.rs
git commit -m "feat(health-check): register mcp_health_check Tauri commands"
```

---

### Task 4: Add frontend API functions

**Files:**
- Modify: `app-v2/src/lib/api.ts` (add two API methods)

- [ ] **Step 1: Add import type**

In `app-v2/src/lib/api.ts`, add `HealthCheckResult` to the import from `./types` (line 1-22). Insert `HealthCheckResult` alphabetically into the existing import list.

- [ ] **Step 2: Add API methods**

In `app-v2/src/lib/api.ts`, add two methods to the `api` object, after `settingsPut` and before the closing `};` (around line 296):

```typescript
  mcpHealthCheck(payload: { server_id: string }): Promise<HealthCheckResult> {
    return invokeCmd("mcp_health_check", { serverId: payload.server_id });
  },

  mcpHealthCheckAll(payload: { client: Client }): Promise<HealthCheckResult[]> {
    return invokeCmd("mcp_health_check_all", { client: payload.client });
  },
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app-v2/src/lib/api.ts
git commit -m "feat(health-check): add frontend API functions for health check"
```

---

### Task 5: Add health check UI to ServersPage

**Files:**
- Modify: `app-v2/src/pages/ServersPage.tsx` (add health check state, buttons, and inline status)

- [ ] **Step 1: Add imports**

In `app-v2/src/pages/ServersPage.tsx`, add `HealthCheckResult` to the type imports from `../lib/types`:

```typescript
import type {
  AppError,
  Client,
  FilePrecondition,
  HealthCheckResult,
  ServerEditDraft,
  ServerEditSession,
  ServerNotes,
  ServerRecord,
  WritePreview,
} from "../lib/types";
```

- [ ] **Step 2: Add health check state**

In the `ServersPage` component, after the existing state declarations (around line 97), add:

```typescript
  const [healthResults, setHealthResults] = useState<Map<string, HealthCheckResult>>(new Map());
  const [healthBusy, setHealthBusy] = useState(false);
```

- [ ] **Step 3: Add health check handler functions**

After the `applyRegistrySyncPreview` function (around line 237), add:

```typescript
  async function runHealthCheck(serverId: string) {
    setHealthResults((prev) => {
      const next = new Map(prev);
      next.set(serverId, {
        server_id: serverId,
        status: "checking",
        checked_at: new Date().toISOString(),
      });
      return next;
    });
    try {
      const result = await api.mcpHealthCheck({ server_id: serverId });
      setHealthResults((prev) => {
        const next = new Map(prev);
        next.set(serverId, result);
        return next;
      });
    } catch (e) {
      setHealthResults((prev) => {
        const next = new Map(prev);
        next.set(serverId, {
          server_id: serverId,
          status: "fail",
          error: (e as AppError).message,
          checked_at: new Date().toISOString(),
        });
        return next;
      });
    }
  }

  async function runHealthCheckAll() {
    if (!servers) return;
    const enabled = servers.filter((s) => s.enabled);
    if (enabled.length === 0) return;

    setHealthBusy(true);
    const checking = new Map(healthResults);
    for (const s of enabled) {
      checking.set(s.server_id, {
        server_id: s.server_id,
        status: "checking",
        checked_at: new Date().toISOString(),
      });
    }
    setHealthResults(new Map(checking));

    try {
      const results = await api.mcpHealthCheckAll({ client });
      setHealthResults((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          next.set(r.server_id, r);
        }
        return next;
      });
    } catch (e) {
      setError(e as AppError);
    } finally {
      setHealthBusy(false);
    }
  }
```

- [ ] **Step 4: Clear health results when switching client**

In the `useEffect` that calls `load()` (line 117-119), also clear health results:

```typescript
  useEffect(() => {
    setHealthResults(new Map());
    void load();
  }, [client, reloadToken]);
```

- [ ] **Step 5: Add "全部检测" button**

In the button row (around line 254-277), add a new button after the "刷新" button:

```typescript
            <button
              type="button"
              className="ui-btn"
              onClick={runHealthCheckAll}
              disabled={busy || healthBusy || !servers || servers.filter(s => s.enabled).length === 0}
            >
              <Icon name="refresh" /> 全部检测
            </button>
```

- [ ] **Step 6: Add health status column header**

In the `<thead>` section, add a new `<th>` between "启用状态" and "操作":

Change the `<colgroup>` from 4 cols to 5:

```html
          <colgroup>
            <col className="ui-colName" />
            <col className="ui-colTransport" />
            <col className="ui-colStatus" />
            <col className="ui-colHealth" />
            <col className="ui-colAction" />
          </colgroup>
```

Add the header row:

```html
          <thead>
            <tr>
              <th className="ui-th">名称</th>
              <th className="ui-th">传输方式</th>
              <th className="ui-th">启用状态</th>
              <th className="ui-th">连通性</th>
              <th className="ui-th ui-tableColAction">操作</th>
            </tr>
          </thead>
```

- [ ] **Step 7: Add health status cell to each row**

Inside the `servers.map()` callback, after the "启用状态" `<td>` and before the "操作" `<td>`, add:

```typescript
                  <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                    {renderHealthStatus(s.server_id, s.enabled)}
                  </td>
```

- [ ] **Step 8: Add the renderHealthStatus helper**

Add this function inside the `ServersPage` component, before the `return` statement:

```typescript
  function renderHealthStatus(serverId: string, enabled: boolean) {
    const result = healthResults.get(serverId);
    if (!result) {
      if (!enabled) return null;
      return (
        <button
          type="button"
          className="ui-btn"
          style={{ padding: "2px 8px", fontSize: "12px", borderRadius: 6 }}
          onClick={() => runHealthCheck(serverId)}
          disabled={healthBusy}
        >
          检测
        </button>
      );
    }
    switch (result.status) {
      case "checking":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-muted)" }}>
            <span className="ui-spinner" /> 检测中
          </span>
        );
      case "ok":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-success, #22c55e)" }}>
            <span style={{ fontWeight: 700 }}>&#10003;</span>
            {result.latency_ms != null ? `${result.latency_ms}ms` : ""}
          </span>
        );
      case "fail":
      case "timeout":
        return (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-danger, #ef4444)", cursor: "pointer" }}
            title={result.error ?? ""}
          >
            <span style={{ fontWeight: 700 }}>&#10007;</span>
            {result.status === "timeout" ? "连接超时" : (result.error ?? "失败")}
          </span>
        );
    }
  }
```

- [ ] **Step 9: Update colSpan values**

Find the two `<td colSpan={4}>` in the empty/loading rows and update them to `colSpan={5}`.

- [ ] **Step 10: Verify TypeScript compilation**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add app-v2/src/pages/ServersPage.tsx
git commit -m "feat(health-check): add health check UI to ServersPage"
```

---

### Task 6: Add spinner CSS animation

**Files:**
- Modify the global CSS file that contains `.ui-spinner` or the main stylesheet

- [ ] **Step 1: Find or create spinner style**

Search for an existing `.ui-spinner` class in the project's CSS:

Run: `grep -r "ui-spinner" /home/ricardo/projects/AIDevHub/app-v2/src/styles/`

If it exists, verify it has a spin animation. If not, find the main stylesheet (likely `app-v2/src/styles/index.css` or similar) and add:

```css
.ui-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border, #e5e7eb);
  border-top-color: var(--color-text, #1f2937);
  border-radius: 50%;
  animation: ui-spin 0.6s linear infinite;
}

@keyframes ui-spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 2: Commit**

```bash
git add app-v2/src/styles/
git commit -m "feat(health-check): add spinner CSS animation"
```

---

### Task 7: Add health check column CSS

**Files:**
- Modify the stylesheet that contains table column widths (likely same file as `.ui-colName`, `.ui-colTransport`, etc.)

- [ ] **Step 1: Find column styles**

Run: `grep -rn "ui-colName\|ui-colTransport\|ui-colStatus" /home/ricardo/projects/AIDevHub/app-v2/src/styles/`

In the same file, add after the existing column styles:

```css
.ui-colHealth {
  width: 120px;
}
```

- [ ] **Step 2: Commit**

```bash
git add app-v2/src/styles/
git commit -m "feat(health-check): add health column CSS width"
```

---

### Task 8: Manual integration test

- [ ] **Step 1: Build the Tauri app**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && cargo tauri dev 2>&1 | head -30`

Expected: App launches

- [ ] **Step 2: Verify in running app**

1. Navigate to the MCP Servers page
2. Select a client (claude_code)
3. Click "全部检测" button
4. Verify spinner appears, then results show (green check + ms or red x + error)
5. Click individual "检测" button on a single server
6. Verify it shows spinner then result
7. Switch client tab → verify health results clear
