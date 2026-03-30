# 首页"最近活动"真实数据展示

**日期**: 2026-03-30
**作者**: Claude
**状态**: 设计阶段

---

## 1. 概述

将首页"最近活动"板块从硬编码的模拟数据改为展示真实的用户操作记录。

### 1.1 现状

Dashboard 组件内硬编码了 3 条活动：

```tsx
const recentActivities = [
  { id: "1", time: "2分钟前", description: "更新了 mcp-server-demo" },
  { id: "2", time: "10分钟前", description: "安装了 skill-code-reviewer" },
  { id: "3", time: "1小时前", description: "创建了备份点 v1.2.0" },
];
```

### 1.2 目标

从 `backup_index.json` 中的 `BackupRecord` 记录读取最近 3 条写操作，转换为中文活动描述展示在首页。

---

## 2. 数据分析

### 2.1 已有数据源：BackupRecord

每次用户执行写操作时，`apply_planned()` 会对用户配置文件（`~/.claude.json`、`~/.codex/config.toml`）创建备份并记录到 `backup_index.json`。

```rust
pub struct BackupRecord {
    pub backup_id: String,
    pub target_path: String,    // 如 "/home/user/.claude.json"
    pub backup_path: String,
    pub created_at: String,     // ISO8601 时间戳
    pub op: BackupOp,           // 操作类型
    pub summary: String,        // 固定为 "auto backup"
}
```

### 2.2 BackupOp 类型

| op | 含义 | 展示文案 |
|----|------|---------|
| `toggle` | 启用/禁用服务器或 Skill | 切换了服务器配置 |
| `add_server` | 添加 MCP 服务器 | 添加了 MCP 服务器 |
| `edit_server` | 编辑 MCP 服务器 | 编辑了 MCP 服务器 |
| `apply_profile` | 应用配置方案 | 应用了配置方案 |
| `rollback` | 回滚备份 | 回滚了配置 |

### 2.3 改进方案：在 BackupRecord 中存储受影响的具体对象

`BackupRecord.summary` 固定为 `"auto backup"`，不包含具体操作了哪个 server/skill。但 `apply_planned()` 内部的 `PlannedWrite.summary`（`WriteSummary`）已经包含 `will_enable/will_disable/will_add` 列表，其中有具体的 server_id。

**方案**：给 `BackupRecord` 新增 `affected_ids: Vec<String>` 字段，在 `backup_file()` 时把 `WriteSummary` 中的 ID 写入。这样前端可以直接知道操作了哪些服务器/Skill。

**注意**：只有涉及用户配置文件变更的操作才会创建 BackupRecord。Skill 的创建/切换操作（文件移动）不一定会产生 BackupRecord，因为 `apply_planned` 只对 `claude_config_path` 和 `codex_config_path` 创建备份。

---

## 3. 设计

### 3.1 整体方案

前后端均需改动：
- **Rust 后端**：`BackupRecord` 新增 `affected_ids` 字段，`apply_planned()` 写入具体 ID
- **TypeScript 类型**：同步更新 `BackupRecord` 接口
- **前端 Dashboard**：用 `affected_ids` + `op` 生成具体活动描述

### 3.2 数据流

```
apply_planned()
   ↓
PlannedWrite.summary (WriteSummary { will_enable, will_disable, will_add })
   ↓
backup_file() — 新增参数，写入 affected_ids
   ↓
BackupRecord { ..., affected_ids: ["claude_code:my-server"] }
   ↓
backup_index.json
   ↓
api.backupList()
   ↓
Dashboard — 按 created_at 倒序取前 3 条
   ↓
formatActivity() — op + affected_ids → 具体中文描述
   ↓
Activity[] → ActivityList 组件
```

### 3.3 Rust 后端改动

**变更文件**: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`

`BackupRecord` 新增字段：

```rust
pub struct BackupRecord {
    // ... 现有字段不变
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub affected_ids: Vec<String>,  // 如 ["claude_code:my-server", "codex:other"]
}
```

**变更文件**: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`

`backup_file()` 新增参数 `affected_ids: Vec<String>`，传入 BackupRecord：

```rust
fn backup_file(
    backups_dir: &Path,
    target: &Path,
    op: BackupOp,
    summary: &str,
    affected_ids: Vec<String>,  // 新增
) -> Result<BackupRecord, CoreError> {
```

`apply_planned()` 调用处，从 `planned.summary` 收集所有 ID 传入：

```rust
let affected = {
    let mut ids = Vec::new();
    ids.extend(planned.summary.will_enable.iter().cloned());
    ids.extend(planned.summary.will_disable.iter().cloned());
    ids.extend(planned.summary.will_add.iter().cloned());
    ids
};
let rec = backup_file(&paths.backups_dir, &f.path, planned.backup_op.clone(), "auto backup", affected.clone())?;
```

**向后兼容**：`affected_ids` 使用 `#[serde(default)]`，旧的 `backup_index.json` 中没有此字段时自动反序列化为空数组，不破坏已有数据。

### 3.4 TypeScript 类型更新

**变更文件**: `app-v2/src/lib/types.ts`

```typescript
export interface BackupRecord {
  // ... 现有字段不变
  affected_ids?: string[];  // 可选，兼容旧数据
}
```

### 3.5 前端活动描述生成

**变更文件**: `app-v2/src/components/Dashboard.tsx`

根据 `op` + `affected_ids` 生成具体描述：

| op | affected_ids 有值 | affected_ids 为空 |
|----|------------------|------------------|
| `toggle` | "启用了 xxx" / "停用了 xxx"（需从备份前后推断，简化为 "切换了 xxx"） | "切换了服务器状态" |
| `add_server` | "添加了 xxx" | "添加了 MCP 服务器" |
| `edit_server` | "编辑了 xxx" | "编辑了 MCP 服务器" |
| `apply_profile` | "应用了配置方案" | "应用了配置方案" |
| `rollback` | "回滚了配置" | "回滚了配置" |

其中 `xxx` 从 `affected_ids` 中提取名称部分（去掉 `claude_code:` / `codex:` 前缀），多个用 `、` 连接。

### 3.6 统计数据硬编码修复（已完成）

App.tsx 中的统计数据已从 API 获取，无需再改。

---

## 4. 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `model.rs` | 修改 | BackupRecord 新增 affected_ids 字段 |
| `ops.rs` | 修改 | backup_file() 新增参数，apply_planned() 传入 affected_ids |
| `types.ts` | 修改 | BackupRecord 接口新增 affected_ids |
| `Dashboard.tsx` | 修改 | 用 affected_ids 生成具体活动描述 |

---

## 5. 边界情况

1. **首次使用**：无备份记录，展示 "暂无最近活动"（已有空态处理）
2. **API 调用失败**：静默处理，展示空列表，不打断用户
3. **备份数据量很大**：`backupList()` 返回全量，前端只取前 3 条，性能无影响
4. **页面切换后数据刷新**：Dashboard 每次挂载都重新加载，保证数据时效性
5. **旧 BackupRecord 无 affected_ids**：serde `default` 保证反序列化为空数组，前端展示通用描述
