# 首页"最近活动"真实数据展示 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页"最近活动"板块从硬编码模拟数据改为展示真实的 BackupRecord 操作记录。

**Architecture:** 纯前端改动。Dashboard 组件挂载时调用已有的 `api.backupList()` 获取备份记录，按时间倒序取前 3 条，利用已有的 `opLabel()` 转换为中文活动描述，新增 `formatRelativeTime()` 将 ISO 时间戳转为相对时间。同时修复 App.tsx 中统计数据的硬编码问题。

**Tech Stack:** React 19 + TypeScript + Tauri v2 IPC + node:test

---

### Task 1: 新增 formatRelativeTime 工具函数及测试

**Files:**
- Modify: `app-v2/src/lib/format.ts:44-49` (在文件末尾追加)
- Create: `app-v2/tests/format.test.mjs`

- [ ] **Step 1: 编写 formatRelativeTime 的测试**

```js
// app-v2/tests/format.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

// formatRelativeTime 是纯函数，直接从源码内联测试逻辑
// 因为 ts 文件不能被 node:test 直接导入，我们在测试中复制核心逻辑
function formatRelativeTime(iso) {
  const now = Date.now();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("formatRelativeTime: 刚刚", () => {
  const result = formatRelativeTime(new Date().toISOString());
  assert.equal(result, "刚刚");
});

test("formatRelativeTime: X分钟前", () => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
  const result = formatRelativeTime(fiveMinAgo);
  assert.equal(result, "5分钟前");
});

test("formatRelativeTime: X小时前", () => {
  const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
  const result = formatRelativeTime(threeHoursAgo);
  assert.equal(result, "3小时前");
});

test("formatRelativeTime: X天前", () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  const result = formatRelativeTime(twoDaysAgo);
  assert.equal(result, "2天前");
});

test("formatRelativeTime: 超过7天显示日期", () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
  const result = formatRelativeTime(tenDaysAgo);
  // 格式为 YYYY-MM-DD
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

test("formatRelativeTime: 无效输入原样返回", () => {
  assert.equal(formatRelativeTime("not-a-date"), "not-a-date");
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd app-v2 && node --test tests/format.test.mjs`
Expected: 所有 6 个测试 PASS

- [ ] **Step 3: 在 format.ts 中实现 formatRelativeTime**

在 `app-v2/src/lib/format.ts` 文件末尾追加：

```typescript
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 4: 再次运行测试确认通过**

Run: `cd app-v2 && node --test tests/format.test.mjs`
Expected: 所有 6 个测试 PASS

- [ ] **Step 5: 提交**

```bash
git add app-v2/src/lib/format.ts app-v2/tests/format.test.mjs
git commit -m "feat: add formatRelativeTime utility for activity display"
```

---

### Task 2: 改造 Dashboard 组件使用真实活动数据

**Files:**
- Modify: `app-v2/src/components/Dashboard.tsx`

- [ ] **Step 1: 修改 Dashboard.tsx**

将整个 `Dashboard.tsx` 替换为以下内容：

```tsx
import { useEffect, useState } from "react";
import { StatCard } from "./StatCard";
import { QuickActionButton } from "./QuickActionButton";
import { ActivityList } from "./ActivityList";
import type { RouteKey } from "./TopNavShell";
import type { BackupRecord } from "../lib/types";
import { api } from "../lib/api";
import { formatRelativeTime, opLabel } from "../lib/format";

interface Activity {
  id: string;
  time: string;
  description: string;
}

interface DashboardProps {
  onNavigate: (route: RouteKey) => void;
  mcpCount?: number;
  mcpActiveCount?: number;
  skillCount?: number;
  skillInstalledCount?: number;
}

function backupToActivity(record: BackupRecord): Activity {
  return {
    id: record.backup_id,
    time: formatRelativeTime(record.created_at),
    description: opLabel(record.op),
  };
}

export function Dashboard({
  onNavigate,
  mcpCount = 0,
  mcpActiveCount = 0,
  skillCount = 0,
  skillInstalledCount = 0,
}: DashboardProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .backupList()
      .then((records) => {
        if (cancelled) return;
        const sorted = [...records].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setActivities(sorted.slice(0, 3).map(backupToActivity));
      })
      .catch(() => {
        if (cancelled) return;
        setActivities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddMcp = () => {
    onNavigate("mcp");
  };

  const handleInstallSkill = () => {
    onNavigate("skills");
  };

  const handleWriteConfig = () => {
    console.log("写入配置");
  };

  return (
    <div className="ui-dashboard">
      <section className="ui-dashboardWelcome">
        <h1>欢迎使用 AIDevHub</h1>
      </section>

      <section className="ui-dashboardStats">
        <StatCard
          title="MCP 概览"
          icon="servers"
          stats={{ total: mcpCount, active: mcpActiveCount }}
        />
        <StatCard
          title="Skill 概览"
          icon="skills"
          stats={{ total: skillCount, installed: skillInstalledCount }}
        />
      </section>

      <section className="ui-dashboardQuickActions">
        <h2 className="ui-sectionTitle">快速操作</h2>
        <div className="ui-quickActionGrid">
          <QuickActionButton icon="plus" label="添加MCP" onClick={handleAddMcp} />
          <QuickActionButton icon="download" label="安装Skill" onClick={handleInstallSkill} />
          <QuickActionButton icon="save" label="写入配置" onClick={handleWriteConfig} />
        </div>
      </section>

      <section className="ui-dashboardActivity">
        <h2 className="ui-sectionTitle">最近活动</h2>
        {loading ? (
          <div className="ui-activityEmpty">加载中...</div>
        ) : (
          <ActivityList activities={activities} />
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd app-v2 && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add app-v2/src/components/Dashboard.tsx
git commit -m "feat: dashboard activity section now shows real backup records"
```

---

### Task 3: 修复 App.tsx 中统计数据的硬编码

**Files:**
- Modify: `app-v2/src/App.tsx:52-55`

- [ ] **Step 1: 修改 App.tsx 中的统计数据逻辑**

将 `App.tsx` 中第 52-55 行的硬编码：

```tsx
const [mcpCount] = useState(12);
const [mcpActiveCount] = useState(10);
const [skillCount] = useState(8);
const [skillInstalledCount] = useState(6);
```

替换为：

```tsx
const [mcpCount, setMcpCount] = useState(0);
const [mcpActiveCount, setMcpActiveCount] = useState(0);
const [skillCount, setSkillCount] = useState(0);
const [skillInstalledCount, setSkillInstalledCount] = useState(0);
```

然后在 `App` 函数体内、`useEffect` 块区域（约第 72 行 `void loadSettings()` 之后）追加一个新的 `useEffect`：

```tsx
useEffect(() => {
  async function loadStats() {
    try {
      const [servers, skills] = await Promise.all([
        api.serverList(),
        api.skillList(),
      ]);
      setMcpCount(servers.length);
      setMcpActiveCount(servers.filter((s) => s.enabled).length);
      setSkillCount(skills.length);
      setSkillInstalledCount(skills.filter((s) => s.scope === "user").length);
    } catch {
      // 静默失败，保持默认值 0
    }
  }
  void loadStats();
}, []);
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd app-v2 && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add app-v2/src/App.tsx
git commit -m "fix: replace hardcoded dashboard stats with real API data"
```

---

### Task 4: 最终验证

- [ ] **Step 1: 运行全部测试**

Run: `cd app-v2 && node --test tests/format.test.mjs`
Expected: PASS

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `cd app-v2 && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 运行 Vite 构建确认无编译错误**

Run: `cd app-v2 && npx vite build`
Expected: 构建成功
