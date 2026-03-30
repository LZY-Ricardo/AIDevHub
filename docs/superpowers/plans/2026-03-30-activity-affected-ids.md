# BackupRecord 增加 affected_ids — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 BackupRecord 中存储受影响的服务器/Skill ID，让首页活动描述从"开关切换"变为"启用了 mcp-server-demo"。

**Architecture:** Rust 后端在 backup_file() 中写入 affected_ids，前端读取后生成具体描述。使用 serde(default) 保证向后兼容。

**Tech Stack:** Rust (aidevhub-core crate) + React 19 + TypeScript + Tauri v2

---

### Task 1: Rust 后端 — model.rs 新增 affected_ids 字段

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/model.rs:194-202`

- [ ] **Step 1: 修改 BackupRecord 结构体**

在 `BackupRecord` 中 `summary` 字段之后追加 `affected_ids`：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    pub backup_id: String,
    pub target_path: String,
    pub backup_path: String,
    pub created_at: String,
    pub op: BackupOp,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub affected_ids: Vec<String>,
}
```

注意 `#[serde(default)]` 保证旧数据反序列化时该字段为空数组。

- [ ] **Step 2: 验证 Rust 编译**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2/src-tauri && cargo check 2>&1`
Expected: 编译成功（可能有一些 unused warning，无 error）

- [ ] **Step 3: 提交**

```bash
git add app-v2/src-tauri/crates/aidevhub-core/src/model.rs
git commit -m "feat: add affected_ids field to BackupRecord"
```

---

### Task 2: Rust 后端 — ops.rs 传递 affected_ids

**Files:**
- Modify: `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`

有三处需要改动：

1. `backup_file()` 函数签名新增参数
2. `backup_file()` 内部构造 BackupRecord 时写入 affected_ids
3. `apply_planned()` 调用 backup_file() 时传入 planned.summary 中的 ID

- [ ] **Step 1: 修改 backup_file() 签名和实现**

将 `backup_file()` 的签名从：

```rust
fn backup_file(backups_dir: &Path, target: &Path, op: BackupOp, summary: &str) -> Result<BackupRecord, CoreError> {
```

改为：

```rust
fn backup_file(backups_dir: &Path, target: &Path, op: BackupOp, summary: &str, affected_ids: Vec<String>) -> Result<BackupRecord, CoreError> {
```

然后在函数体末尾构造 `BackupRecord` 时加入 `affected_ids`：

```rust
    Ok(BackupRecord {
        backup_id,
        target_path: target.to_string_lossy().to_string(),
        backup_path: backup_path.to_string_lossy().to_string(),
        created_at: ts,
        op,
        summary: summary.to_string(),
        affected_ids,
    })
```

- [ ] **Step 2: 修改 apply_planned() 中的调用**

在 `apply_planned()` 函数中，找到调用 `backup_file()` 的循环（大约在 1992-2000 行）。在循环之前收集 affected_ids，然后在调用时传入：

将：
```rust
    let mut backups = Vec::new();
    // Backup only user config files, not app storage.
    for f in &planned.files {
        let is_user_config = f.path == paths.claude_config_path || f.path == paths.codex_config_path;
        if is_user_config && f.before.is_some() {
            let rec = backup_file(&paths.backups_dir, &f.path, planned.backup_op.clone(), "auto backup")?;
            backups.push(rec);
        }
    }
```

改为：
```rust
    let affected_ids = {
        let mut ids = Vec::new();
        ids.extend(planned.summary.will_enable.iter().cloned());
        ids.extend(planned.summary.will_disable.iter().cloned());
        ids.extend(planned.summary.will_add.iter().cloned());
        ids
    };

    let mut backups = Vec::new();
    // Backup only user config files, not app storage.
    for f in &planned.files {
        let is_user_config = f.path == paths.claude_config_path || f.path == paths.codex_config_path;
        if is_user_config && f.before.is_some() {
            let rec = backup_file(&paths.backups_dir, &f.path, planned.backup_op.clone(), "auto backup", affected_ids.clone())?;
            backups.push(rec);
        }
    }
```

- [ ] **Step 3: 修改 rollback 中的 backup_file 调用**

在 `backup_preview_rollback` 或 `backup_apply_rollback` 函数中，也有调用 `backup_file()`。找到它们并传入空的 `vec![]` 作为 affected_ids（回滚操作没有对应的 WriteSummary）。

搜索所有 `backup_file(` 调用，确保都传入了第5个参数。对于 rollback 相关的调用，传入 `vec![]`。

- [ ] **Step 4: 验证 Rust 编译**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2/src-tauri && cargo check 2>&1`
Expected: 无 error

- [ ] **Step 5: 提交**

```bash
git add app-v2/src-tauri/crates/aidevhub-core/src/ops.rs
git commit -m "feat: pass affected_ids from WriteSummary into BackupRecord"
```

---

### Task 3: TypeScript 类型 + 前端描述生成

**Files:**
- Modify: `app-v2/src/lib/types.ts:115-122`
- Modify: `app-v2/src/components/Dashboard.tsx`

- [ ] **Step 1: 更新 BackupRecord 类型**

在 `app-v2/src/lib/types.ts` 的 `BackupRecord` 接口中追加：

```typescript
export interface BackupRecord {
  backup_id: string;
  target_path: string;
  backup_path: string;
  created_at: string;
  op: BackupOp;
  summary: string;
  affected_ids?: string[];  // 新增，可选以兼容旧数据
}
```

- [ ] **Step 2: 更新 Dashboard.tsx 中的描述生成逻辑**

修改 `Dashboard.tsx` 中的 `backupToActivity` 函数，利用 `affected_ids` 生成具体描述：

```tsx
function extractName(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function formatActivityDescription(op: BackupOp, affectedIds?: string[]): string {
  const names = (affectedIds ?? []).map(extractName);
  const nameStr = names.length > 0 ? names.join('、') : '';

  switch (op) {
    case 'toggle':
      return nameStr ? `切换了 ${nameStr}` : '切换了服务器状态';
    case 'add_server':
      return nameStr ? `添加了 ${nameStr}` : '添加了 MCP 服务器';
    case 'edit_server':
      return nameStr ? `编辑了 ${nameStr}` : '编辑了 MCP 服务器';
    case 'apply_profile':
      return '应用了配置方案';
    case 'rollback':
      return '回滚了配置';
  }
}

function backupToActivity(record: BackupRecord): Activity {
  return {
    id: record.backup_id,
    time: formatRelativeTime(record.created_at),
    description: formatActivityDescription(record.op, record.affected_ids),
  };
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 4: 验证 Vite 构建**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && npx vite build`
Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
git add app-v2/src/lib/types.ts app-v2/src/components/Dashboard.tsx
git commit -m "feat: use affected_ids to show specific server names in activity"
```

---

### Task 4: 最终验证

- [ ] **Step 1: Rust 编译 + 测试**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2/src-tauri && cargo check 2>&1`
Expected: 无 error

- [ ] **Step 2: 前端测试**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && node --test tests/format.test.mjs`
Expected: 6/6 PASS

- [ ] **Step 3: TypeScript 类型检查**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 4: Vite 构建**

Run: `cd /home/ricardo/projects/AIDevHub/app-v2 && npx vite build`
Expected: 构建成功
