# MCP 健康检测功能设计

日期: 2026-03-30

## 概述

为 AIDevHub 的 MCP 服务管理页面增加健康检测功能，让用户能验证已配置的 MCP 服务是否可以正常连接。支持单个检测和批量全测，检测结果以内联方式展示在服务列表中。

## 需求

- 支持单个服务检测和一键全部检测
- 连接层检测（MCP `initialize` 握手 + `ping`），不深入到工具调用
- 在服务列表中以进度指示器方式展示结果（spinner → 勾/叉 + 耗时）
- 同时支持 stdio 和 http 两种传输类型
- 检测在 Rust 后端执行，通过 Tauri IPC 通信

## 架构

```
前端 (React)                    后端 (Rust/Tauri)
┌─────────────┐                ┌──────────────────────┐
│ ServersPage │── invoke() ──→ │ mcp_health_check     │
│  - 单测按钮 │                │ mcp_health_check_all │
│  - 全测按钮 │                │                      │
│  - 状态渲染 │                │ 检测流程:             │
└─────────────┘                │  1. spawn/connect    │
                               │  2. initialize 握手  │
                               │  3. ping             │
                               │  4. 记录结果         │
                               │  5. 清理连接         │
                               └──────────────────────┘
```

## 数据模型

### Rust

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub checked_at: String, // ISO8601
}
```

### TypeScript

```typescript
type HealthStatus = "checking" | "ok" | "fail" | "timeout";

interface HealthCheckResult {
  server_id: string;
  status: HealthStatus;
  latency_ms?: number;
  error?: string;
  checked_at: string;
}
```

## 检测协议

### stdio 类型

1. 根据 payload 中的 `command` + `args` + `env` spawn 子进程
2. 通过 stdin 发送 JSON-RPC `initialize` 请求:
   ```json
   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"aidevhub","version":"1.0.0"}}}
   ```
3. 从 stdout 读取 `initialize` 响应（超时 5s）
4. 发送 `initialized` 通知:
   ```json
   {"jsonrpc":"2.0","method":"notifications/initialized"}
   ```
5. 发送 `ping` 请求:
   ```json
   {"jsonrpc":"2.0","id":2,"method":"ping"}
   ```
6. 读取 `ping` 响应（超时 5s）
7. kill 子进程
8. 记录总耗时

### http 类型

1. POST 请求到 payload 中的 `url`
2. 发送 `initialize` JSON-RPC 请求（超时 5s）
3. 发送 `initialized` 通知
4. 发送 `ping` 请求（超时 5s）
5. 关闭连接
6. 记录总耗时

### 超时策略

- 每步操作超时: 5 秒
- 单服务总超时: 15 秒
- 超时返回 `HealthStatus::Timeout`

## Tauri Commands

```rust
#[tauri::command]
fn mcp_health_check(app: AppHandle, server_id: String) -> Result<HealthCheckResult, AppError>;

#[tauri::command]
fn mcp_health_check_all(app: AppHandle, client: Client) -> Result<Vec<HealthCheckResult>, AppError>;
```

`mcp_health_check_all` 对服务列表并发执行检测，使用 tokio 的 `join_all` 或 `FuturesUnordered`，但限制并发数上限为 5。

## 前端 UI

### 状态展示（方案 B: 进度指示器）

在每个服务行的状态列增加检测状态区域:

| 状态 | 展示 |
|------|------|
| 未检测 | 无显示（或仅在全测模式下显示占位） |
| 检测中 | 旋转 spinner 动画 |
| 成功 | 绿色勾 `✓` + 耗时（如 `45ms`） |
| 失败 | 红色叉 `✗` + 错误摘要（如 `连接超时`） |

### 交互

- 服务列表上方增加「全部检测」按钮
- 每行 hover 时显示「检测」小按钮（仅在未检测或检测完成时显示）
- 检测中的行禁止重复点击
- 全测时忽略已禁用的服务（只检测 `enabled: true` 的）

### 状态管理

- 前端维护 `Map<server_id, HealthCheckResult>` 的状态
- 每次调用检测命令时先设置为 `checking` 状态
- 命令返回后更新为实际结果
- 切换 client tab 或页面刷新后清空结果

## 错误处理

- spawn 失败（命令不存在、权限不足）→ `Fail` + 错误信息
- 连接被拒绝 → `Fail` + "Connection refused"
- 超时 → `Timeout` + "连接超时 (5s)"
- 响应格式错误 → `Fail` + 解析错误信息
- 子进程崩溃 → `Fail` + "进程异常退出"

## 依赖

- Rust: `tokio` (已有), `serde_json` (已有)
- 无需新增外部 crate，使用标准库 + tokio 的 `process::Command` 和 `net` 模块

## 文件变更清单

### Rust 后端

| 文件 | 变更 |
|------|------|
| `crates/aidevhub-core/src/model.rs` | 新增 `HealthStatus`, `HealthCheckResult` |
| `crates/aidevhub-core/src/health_check.rs` | **新建** - 检测核心逻辑 |
| `crates/aidevhub-core/src/lib.rs` | 导出 `health_check` 模块 |
| `src-tauri/src/lib.rs` | 注册 `mcp_health_check`, `mcp_health_check_all` 命令 |
| `Cargo.toml` | 可能需要 `reqwest`（http 类型检测） |

### React 前端

| 文件 | 变更 |
|------|------|
| `src/lib/types.ts` | 新增 `HealthStatus`, `HealthCheckResult` 类型 |
| `src/lib/api.ts` | 新增 `mcpHealthCheck`, `mcpHealthCheckAll` 函数 |
| `src/pages/ServersPage.tsx` | 集成检测 UI（状态列、按钮、全测） |

## 不做的事

- 不做工具级别的深度检测（tools/list、tools/call）
- 不做定时自动检测
- 不做历史记录持久化
- 不检测已禁用的服务
