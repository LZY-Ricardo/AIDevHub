# 顶部导航栏重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有的左侧边栏导航布局改为顶部导航栏布局，增加主内容区域视野空间

**Architecture:** 保持现有 API 和状态管理逻辑不变，主要变更在 UI 组件层：新增 TopNavShell 和 Dashboard 组件，重构路由逻辑，适配现有页面使用新的 PageHeader

**Tech Stack:** React 18, TypeScript, Vite, Tauri, 现有 CSS 变量系统

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|------|------|
| `app-v2/src/components/TopNavShell.tsx` | 顶部导航布局容器 |
| `app-v2/src/components/TopbarBrand.tsx` | 项目名称和设置入口 |
| `app-v2/src/components/TopbarNav.tsx` | 首页主导航按钮 |
| `app-v2/src/components/PageHeader.tsx` | 二级页面头部组件 |
| `app-v2/src/components/Dashboard.tsx` | 首页仪表盘 |
| `app-v2/src/components/StatCard.tsx` | 统计卡片组件 |
| `app-v2/src/components/QuickActionButton.tsx` | 快速操作按钮 |
| `app-v2/src/components/ActivityList.tsx` | 最近活动列表 |
| `app-v2/src/components/SettingsTabs.tsx` | 设置页面 Tab 切换 |

### 修改文件
| 文件 | 修改内容 |
|------|----------|
| `app-v2/src/App.tsx` | 路由重构，使用 TopNavShell，新增 Dashboard 路由 |
| `app-v2/src/components/AppShell.tsx` | 标记为废弃（保留作为参考） |
| `app-v2/src/components/Icon.tsx` | 添加新图标：settings, arrowLeft, download, save |
| `app-v2/src/pages/ServersPage.tsx` | 使用 PageHeader 替代现有标题 |
| `app-v2/src/pages/SkillsPage.tsx` | 使用 PageHeader 替代现有标题 |
| `app-v2/src/pages/ProfilesPage.tsx` | 移动到 SettingsPage 内部 |
| `app-v2/src/pages/BackupsPage.tsx` | 移动到 SettingsPage 内部 |
| `app-v2/src/pages/SettingsPage.tsx` | 支持 Tab 切换，整合配置方案和备份回滚 |
| `app-v2/src/styles/ui.css` | 添加顶部导航相关样式，废弃侧边栏样式 |

---

## Task 1: 扩展 Icon 组件

**Files:**
- Modify: `app-v2/src/components/Icon.tsx:1-263`

- [ ] **Step 1: 添加新的图标名称到 IconName 类型**

```tsx
type IconName =
  | "dashboard"
  | "servers"
  | "plus"
  | "profiles"
  | "skills"
  | "backups"
  | "external"
  | "chevronRight"
  | "chevronDown"
  | "x"
  | "warning"
  | "info"
  | "check"
  | "refresh"
  | "settings"      // 新增：设置图标
  | "arrowLeft"     // 新增：返回箭头
  | "download"      // 新增：下载/安装
  | "save";         // 新增：保存
```

在 `app-v2/src/components/Icon.tsx` 的第 1-15 行，将 `type IconName` 修改为上述内容。

- [ ] **Step 2: 添加 settings 图标的渲染分支**

在 `switch` 语句中添加（在 `case "refresh":` 之后）：

```tsx
case "settings":
  return (
    <svg {...common}>
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
```

插入位置：在 `app-v2/src/components/Icon.tsx` 第 260 行（`case "refresh"` 结束）之后。

- [ ] **Step 3: 添加 arrowLeft 图标的渲染分支**

```tsx
case "arrowLeft":
  return (
    <svg {...common}>
      <path
        d="m19 12-7-7 7-7M12 19V5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
```

插入位置：在 `case "settings":` 之后。

- [ ] **Step 4: 添加 download 图标的渲染分支**

```tsx
case "download":
  return (
    <svg {...common}>
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15V3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
```

插入位置：在 `case "arrowLeft":` 之后。

- [ ] **Step 5: 添加 save 图标的渲染分支**

```tsx
case "save":
  return (
    <svg {...common}>
      <path
        d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M17 21v-8H7v8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 3v5h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
```

插入位置：在 `case "download":` 之后。

- [ ] **Step 6: 运行开发服务器验证图标无错误**

```bash
cd app-v2 && npm run dev
```

Expected: 开发服务器启动成功，无 TypeScript 类型错误

- [ ] **Step 7: 提交变更**

```bash
git add app-v2/src/components/Icon.tsx
git commit -m "feat(icon): add settings, arrowLeft, download, save icons"
```

---

## Task 2: 创建 TopbarBrand 组件

**Files:**
- Create: `app-v2/src/components/TopbarBrand.tsx`

- [ ] **Step 1: 创建 TopbarBrand 组件文件**

```tsx
import { Icon } from "./Icon";

interface TopbarBrandProps {
  onSettingsClick: () => void;
}

export function TopbarBrand({ onSettingsClick }: TopbarBrandProps) {
  return (
    <div className="ui-topbarBrand">
      <h1 className="ui-brandName">AIDevHub</h1>
      <button
        className="ui-iconBtn"
        onClick={onSettingsClick}
        aria-label="设置"
      >
        <Icon name="settings" size={18} />
      </button>
    </div>
  );
}
```

创建文件 `app-v2/src/components/TopbarBrand.tsx`，内容为上述代码。

- [ ] **Step 2: 提交变更**

```bash
git add app-v2/src/components/TopbarBrand.tsx
git commit -m "feat(components): create TopbarBrand component"
```

---

## Task 3: 创建 TopbarNav 组件

**Files:**
- Create: `app-v2/src/components/TopbarNav.tsx`

- [ ] **Step 1: 创建 TopbarNav 组件文件**

```tsx
import { Icon } from "./Icon";

interface TopbarNavProps {
  onMcpClick: () => void;
  onSkillClick: () => void;
}

export function TopbarNav({ onMcpClick, onSkillClick }: TopbarNavProps) {
  return (
    <nav className="ui-topbarNav">
      <button className="ui-topbarNavItem" onClick={onMcpClick}>
        <Icon name="servers" size={18} />
        <span>MCP管理</span>
      </button>
      <button className="ui-topbarNavItem" onClick={onSkillClick}>
        <Icon name="skills" size={18} />
        <span>Skill管理</span>
      </button>
    </nav>
  );
}
```

创建文件 `app-v2/src/components/TopbarNav.tsx`，内容为上述代码。

- [ ] **Step 2: 提交变更**

```bash
git add app-v2/src/components/TopbarNav.tsx
git commit -m "feat(components): create TopbarNav component"
```

---

## Task 4: 创建 PageHeader 组件

**Files:**
- Create: `app-v2/src/components/PageHeader.tsx`

- [ ] **Step 1: 创建 PageHeader 组件文件**

```tsx
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface PageHeaderAction {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
}

interface PageHeaderProps {
  title: string;
  kicker?: string;
  actions?: PageHeaderAction[];
  onBack?: () => void;
}

export function PageHeader({ title, kicker, actions = [], onBack }: PageHeaderProps) {
  return (
    <header className="ui-pageHeaderBar">
      <div className="ui-pageHeaderLeft">
        {onBack && (
          <button className="ui-backBtn" onClick={onBack} aria-label="返回">
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        <div>
          <h1 className="ui-pageTitleBar">{title}</h1>
          {kicker && <div className="ui-pageKicker">{kicker}</div>}
        </div>
      </div>
      {actions.length > 0 && (
        <div className="ui-pageHeaderActions">
          {actions.map((action) => (
            <button
              key={action.label}
              className="ui-actionBtn"
              onClick={action.onClick}
              aria-label={action.label}
            >
              <Icon name={action.icon} size={18} />
              <span className="ui-actionLabel">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
```

创建文件 `app-v2/src/components/PageHeader.tsx`，内容为上述代码。

- [ ] **Step 2: 提交变更**

```bash
git add app-v2/src/components/PageHeader.tsx
git commit -m "feat(components): create PageHeader component"
```

---

## Task 5: 创建 TopNavShell 组件

**Files:**
- Create: `app-v2/src/components/TopNavShell.tsx`

- [ ] **Step 1: 创建 TopNavShell 组件文件**

```tsx
import type { ReactNode } from "react";
import { TopbarBrand } from "./TopbarBrand";
import { TopbarNav } from "./TopbarNav";

export type RouteKey = "dashboard" | "mcp" | "skills" | "settings";

interface TopNavShellProps {
  route: RouteKey;
  onNavigate: (route: RouteKey) => void;
  children: ReactNode;
}

export function TopNavShell({ route, onNavigate, children }: TopNavShellProps) {
  const handleSettingsClick = () => {
    onNavigate("settings");
  };

  const handleMcpClick = () => {
    onNavigate("mcp");
  };

  const handleSkillClick = () => {
    onNavigate("skills");
  };

  const isDashboard = route === "dashboard";

  return (
    <div className="ui-shell">
      {isDashboard ? (
        <header className="ui-topbar">
          <TopbarBrand onSettingsClick={handleSettingsClick} />
          <TopbarNav onMcpClick={handleMcpClick} onSkillClick={handleSkillClick} />
        </header>
      ) : null}
      <main className="ui-main">{children}</main>
    </div>
  );
}
```

创建文件 `app-v2/src/components/TopNavShell.tsx`，内容为上述代码。

- [ ] **Step 2: 提交变更**

```bash
git add app-v2/src/components/TopNavShell.tsx
git commit -m "feat(components): create TopNavShell component"
```

---

## Task 6: 添加顶部导航样式

**Files:**
- Modify: `app-v2/src/styles/ui.css`

- [ ] **Step 1: 修改 .ui-shell 为纵向布局**

找到 `.ui-shell` 定义（第 1-7 行），修改为：

```css
.ui-shell {
  height: 100vh;
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr; /* 从 columns 改为 rows */
  overflow: hidden;
}
```

- [ ] **Step 2: 添加顶部导航栏样式**

在文件末尾添加：

```css
/* === 顶部导航栏 === */
.ui-topbar {
  height: 64px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-lg);
  border-bottom: 1px solid var(--color-border);
  background: #ffffff;
}

.ui-topbarBrand {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.ui-brandName {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.ui-topbarNav {
  display: flex;
  gap: var(--space-sm);
}

.ui-topbarNavItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font-weight: 500;
  transition: background var(--dur-fast) var(--ease-out);
}

.ui-topbarNavItem:hover {
  background: rgba(var(--color-text-rgb), 0.06);
}

.ui-iconBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  color: var(--color-text);
  transition: background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.ui-iconBtn:hover {
  background: rgba(var(--color-text-rgb), 0.06);
  border-color: rgba(var(--color-text-rgb), 0.15);
}

.ui-iconBtn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(30, 41, 59, 0.15);
}

/* === 页面头部栏（二级页面） === */
.ui-pageHeaderBar {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-lg);
  border-bottom: 1px solid var(--color-border-subtle);
  background: rgba(var(--color-ink-rgb), 0.02);
}

.ui-pageHeaderLeft {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.ui-backBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  color: var(--color-text);
  transition: background var(--dur-fast) var(--ease-out);
}

.ui-backBtn:hover {
  background: rgba(var(--color-text-rgb), 0.06);
}

.ui-backBtn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(30, 41, 59, 0.15);
}

.ui-pageTitleBar {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin: 0;
}

.ui-pageHeaderActions {
  display: flex;
  gap: var(--space-sm);
}

.ui-actionBtn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: rgba(var(--color-text-rgb), 0.04);
  cursor: pointer;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 500;
  transition: background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.ui-actionBtn:hover {
  background: rgba(var(--color-text-rgb), 0.08);
  border-color: rgba(var(--color-text-rgb), 0.15);
}

.ui-actionBtn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(30, 41, 59, 0.15);
}

.ui-actionLabel {
  font-family: var(--font-body);
}

/* === 适配主内容区域（去掉侧边栏占用的左侧内边距） === */
.ui-main {
  grid-column: 1; /* 从 grid-column: 2 改为 1 */
  grid-row: 2;
  height: 100vh;
  min-height: 0;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-2xl);
  min-width: 0;
}

/* 当在非首页时，主内容从顶部开始，不需要额外的顶部padding */
.ui-shell > .ui-main:not(:only-child) {
  padding-top: var(--space-lg);
}

/* === 废弃旧侧边栏样式（保留用于参考） === */
/*
.ui-sidebar { ... }
.ui-nav { ... }
.ui-navItem { ... }
.ui-navLabel { ... }
.ui-badge { ... }
*/
```

- [ ] **Step 3: 提交变更**

```bash
git add app-v2/src/styles/ui.css
git commit -m "feat(styles): add top navigation styles, refactor shell layout"
```

---

## Task 7: 创建 Dashboard 组件

**Files:**
- Create: `app-v2/src/components/Dashboard.tsx`
- Create: `app-v2/src/components/StatCard.tsx`
- Create: `app-v2/src/components/QuickActionButton.tsx`
- Create: `app-v2/src/components/ActivityList.tsx`

- [ ] **Step 1: 创建 StatCard 组件**

```tsx
import { Icon } from "./Icon";

interface StatCardProps {
  title: string;
  icon: Parameters<typeof Icon>[0]["name"];
  stats: {
    total?: number;
    active?: number;
    installed?: number;
  };
}

export function StatCard({ title, icon, stats }: StatCardProps) {
  const items: Array<{ label: string; value: number }> = [];

  if (stats.total !== undefined) {
    items.push({ label: "总数", value: stats.total });
  }
  if (stats.active !== undefined) {
    items.push({ label: "活跃", value: stats.active });
  }
  if (stats.installed !== undefined) {
    items.push({ label: "已安装", value: stats.installed });
  }

  return (
    <div className="ui-statCard">
      <div className="ui-statCardHeader">
        <Icon name={icon} size={20} />
        <h3 className="ui-statCardTitle">{title}</h3>
      </div>
      <div className="ui-statCardBody">
        {items.map((item) => (
          <div key={item.label} className="ui-statItem">
            <span className="ui-statLabel">{item.label}</span>
            <span className="ui-statValue">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

创建文件 `app-v2/src/components/StatCard.tsx`。

- [ ] **Step 2: 创建 QuickActionButton 组件**

```tsx
import { Icon } from "./Icon";

interface QuickActionButtonProps {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
}

export function QuickActionButton({ icon, label, onClick }: QuickActionButtonProps) {
  return (
    <button className="ui-quickActionBtn" onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}
```

创建文件 `app-v2/src/components/QuickActionButton.tsx`。

- [ ] **Step 3: 创建 ActivityList 组件**

```tsx
interface Activity {
  id: string;
  time: string;
  description: string;
}

interface ActivityListProps {
  activities: Activity[];
}

export function ActivityList({ activities }: ActivityListProps) {
  if (activities.length === 0) {
    return <div className="ui-activityEmpty">暂无最近活动</div>;
  }

  return (
    <ul className="ui-activityList">
      {activities.map((activity) => (
        <li key={activity.id} className="ui-activityItem">
          <span className="ui-activityTime">{activity.time}</span>
          <span className="ui-activityDesc">{activity.description}</span>
        </li>
      ))}
    </ul>
  );
}
```

创建文件 `app-v2/src/components/ActivityList.tsx`。

- [ ] **Step 4: 创建 Dashboard 主组件**

```tsx
import { StatCard } from "./StatCard";
import { QuickActionButton } from "./QuickActionButton";
import { ActivityList } from "./ActivityList";
import type { RouteKey } from "./TopNavShell";

interface DashboardProps {
  onNavigate: (route: RouteKey) => void;
  mcpCount?: number;
  mcpActiveCount?: number;
  skillCount?: number;
  skillInstalledCount?: number;
}

export function Dashboard({
  onNavigate,
  mcpCount = 0,
  mcpActiveCount = 0,
  skillCount = 0,
  skillInstalledCount = 0,
}: DashboardProps) {
  // 模拟最近活动数据（实际应从 API 获取）
  const recentActivities = [
    { id: "1", time: "2分钟前", description: "更新了 mcp-server-demo" },
    { id: "2", time: "10分钟前", description: "安装了 skill-code-reviewer" },
    { id: "3", time: "1小时前", description: "创建了备份点 v1.2.0" },
  ];

  const handleAddMcp = () => {
    onNavigate("mcp");
  };

  const handleInstallSkill = () => {
    onNavigate("skills");
  };

  const handleWriteConfig = () => {
    // TODO: 触发写入配置操作
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
        <ActivityList activities={recentActivities} />
      </section>
    </div>
  );
}
```

创建文件 `app-v2/src/components/Dashboard.tsx`。

- [ ] **Step 5: 添加 Dashboard 样式**

在 `app-v2/src/styles/ui.css` 末尾添加：

```css
/* === Dashboard 仪表盘 === */
.ui-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xl);
}

.ui-dashboardWelcome h1 {
  font-family: var(--font-mono);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  margin: 0;
  color: var(--color-text);
}

.ui-dashboardStats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.ui-statCard {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  transition: transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.ui-statCard:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.ui-statCardHeader {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
  color: var(--color-muted);
}

.ui-statCardTitle {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.ui-statCardBody {
  display: flex;
  gap: var(--space-lg);
}

.ui-statItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ui-statLabel {
  font-size: 12px;
  color: var(--color-muted);
}

.ui-statValue {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
}

.ui-sectionTitle {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--space-md) 0;
}

.ui-quickActionGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-md);
}

.ui-quickActionBtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #ffffff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  transition: background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.ui-quickActionBtn:hover {
  background: rgba(var(--color-text-rgb), 0.04);
  border-color: rgba(var(--color-text-rgb), 0.15);
  transform: translateY(-2px);
}

.ui-activityList {
  list-style: none;
  padding: 0;
  margin: 0;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.ui-activityItem {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border-subtle);
}

.ui-activityItem:last-child {
  border-bottom: none;
}

.ui-activityTime {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-muted);
}

.ui-activityDesc {
  color: var(--color-text);
}

.ui-activityEmpty {
  padding: var(--space-lg);
  text-align: center;
  color: var(--color-muted);
  font-size: 14px;
  background: rgba(var(--color-text-rgb), 0.02);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 6: 提交变更**

```bash
git add app-v2/src/components/StatCard.tsx app-v2/src/components/QuickActionButton.tsx app-v2/src/components/ActivityList.tsx app-v2/src/components/Dashboard.tsx app-v2/src/styles/ui.css
git commit -m "feat(components): create Dashboard component with stat cards, quick actions, and activity list"
```

---

## Task 8: 创建 SettingsTabs 组件

**Files:**
- Create: `app-v2/src/components/SettingsTabs.tsx`

- [ ] **Step 1: 创建 SettingsTabs 组件**

```tsx
import { useState } from "react";
import type { ReactNode } from "react";

export type SettingsTab = "profiles" | "backups" | "preferences";

interface SettingsTabConfig {
  key: SettingsTab;
  label: string;
  content: ReactNode;
}

interface SettingsTabsProps {
  tabs: SettingsTabConfig[];
  defaultTab?: SettingsTab;
}

export function SettingsTabs({ tabs, defaultTab = "profiles" }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  const activeContent = tabs.find((tab) => tab.key === activeTab)?.content;

  return (
    <div className="ui-settingsTabs">
      <div className="ui-settingsTabList" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="ui-settingsTabBtn"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ui-settingsTabContent" role="tabpanel">
        {activeContent}
      </div>
    </div>
  );
}
```

创建文件 `app-v2/src/components/SettingsTabs.tsx`。

- [ ] **Step 2: 添加 SettingsTabs 样式**

在 `app-v2/src/styles/ui.css` 末尾添加：

```css
/* === Settings Tabs === */
.ui-settingsTabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.ui-settingsTabList {
  display: flex;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-lg);
}

.ui-settingsTabBtn {
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.ui-settingsTabBtn:hover {
  color: var(--color-text);
}

.ui-settingsTabBtn[aria-selected="true"] {
  color: var(--color-text);
  border-bottom-color: var(--color-text);
}

.ui-settingsTabContent {
  padding: 0 var(--space-lg);
}
```

- [ ] **Step 3: 提交变更**

```bash
git add app-v2/src/components/SettingsTabs.tsx app-v2/src/styles/ui.css
git commit -m "feat(components): create SettingsTabs component"
```

---

## Task 9: 重构 App.tsx 使用新的路由和布局

**Files:**
- Modify: `app-v2/src/App.tsx`

- [ ] **Step 1: 备份现有 App.tsx**

```bash
cp app-v2/src/App.tsx app-v2/src/App.tsx.backup
```

- [ ] **Step 2: 重写 App.tsx**

完全替换 `app-v2/src/App.tsx` 的内容为：

```tsx
import { useEffect, useMemo, useState } from "react";
import { TopNavShell, type RouteKey } from "./components/TopNavShell";
import { PageHeader, type PageHeaderAction } from "./components/PageHeader";
import { Dashboard } from "./components/Dashboard";
import { SettingsTabs, type SettingsTab } from "./components/SettingsTabs";
import { ConfigChangeDialog } from "./components/ConfigChangeDialog";
import { McpConfigDiffDialog } from "./components/McpConfigDiffDialog";
import { McpConfigDiffSummaryDialog } from "./components/McpConfigDiffSummaryDialog";
import { createRequestCoordinator } from "./lib/config-check-flow.js";
import { confirmMcpUpdateWithRefresh } from "./lib/config-confirm-flow.js";
import {
  deriveCheckResultState,
  deriveIgnorePreflightState,
  shouldRefreshAfterIgnore,
} from "./lib/config-check-state.js";
import { api } from "./lib/api";
import type {
  AppSettings,
  AppError,
  ConfigConfirmMcpRequest,
  ConfigConfirmMcpResponse,
  ConfigUpdateItem,
  Client,
  FilePrecondition,
  McpRegistryExternalDiff,
} from "./lib/types";
import { ServersPage } from "./pages/ServersPage";
import { AddServerPage } from "./pages/AddServerPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SkillsPage } from "./pages/SkillsPage";
import { BackupsPage } from "./pages/BackupsPage";
import { SettingsPage as SettingsPageContent } from "./pages/SettingsPage";

let startupConfigCheckBootstrapped = false;

function App() {
  const [route, setRoute] = useState<RouteKey>(() => readRouteFromHash() ?? "dashboard");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<AppError | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [updates, setUpdates] = useState<ConfigUpdateItem[]>([]);
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState<AppError | null>(null);
  const [registryDiff, setRegistryDiff] = useState<McpRegistryExternalDiff | null>(null);
  const [registryDiffDialogOpen, setRegistryDiffDialogOpen] = useState(false);
  const [registrySummaryDialogOpen, setRegistrySummaryDialogOpen] = useState(false);
  const [registryFlowBusy, setRegistryFlowBusy] = useState(false);
  const [registryFlowError, setRegistryFlowError] = useState<AppError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const configCheckFlow = useMemo(() => createRequestCoordinator(), []);

  // 统计数据（TODO: 从 API 获取）
  const [mcpCount, setMcpCount] = useState(12);
  const [mcpActiveCount, setMcpActiveCount] = useState(10);
  const [skillCount, setSkillCount] = useState(8);
  const [skillInstalledCount, setSkillInstalledCount] = useState(6);

  useEffect(() => {
    const onHash = () => {
      const r = readRouteFromHash();
      if (r) setRoute(r);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (startupConfigCheckBootstrapped) return;
    startupConfigCheckBootstrapped = true;
    void runConfigCheck();
  }, []);

  useEffect(() => {
    void loadSettings();
  }, []);

  function navigate(r: RouteKey) {
    setRoute(r);
    window.location.hash = r === "dashboard" ? "#/" : `#/${r}`;
  }

  async function runConfigCheck(options?: { propagateError?: boolean }) {
    const requestId = configCheckFlow.begin();
    setConfigBusy(true);
    setConfigError(null);
    try {
      const res = await api.configCheckUpdates();
      if (!configCheckFlow.isLatest(requestId)) return;
      const next = deriveCheckResultState(res.updates, configError);
      setUpdates(next.updates);
      setConfigDialogOpen(next.dialogOpen);
      setConfigError(next.error);
    } catch (e) {
      if (!configCheckFlow.isLatest(requestId)) return;
      setConfigError(e as AppError);
      if (options?.propagateError) {
        throw e;
      }
    } finally {
      setConfigBusy(configCheckFlow.end(requestId));
    }
  }

  async function loadSettings() {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const next = await api.settingsGet();
      setSettings(next);
    } catch (e) {
      setSettings(null);
      setSettingsError(e as AppError);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function saveSettings(next: AppSettings) {
    if (!settings) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const saved = await api.settingsPut(next);
      setSettings(saved);
    } catch (e) {
      setSettingsError(e as AppError);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function ignoreConfigUpdates(conditions: { source_id: string; current_sha256: string }[]) {
    if (conditions.length === 0 || configBusy) return;
    setConfigBusy(true);
    setConfigError(null);
    const preflight = deriveIgnorePreflightState();
    setUpdates(preflight.updates);
    setConfigDialogOpen(preflight.dialogOpen);
    let ignoreError: unknown = null;
    try {
      await api.configIgnoreUpdates({ conditions });
    } catch (e) {
      ignoreError = e;
      setConfigError(e as AppError);
    } finally {
      if (shouldRefreshAfterIgnore(ignoreError)) {
        await runConfigCheck();
      }
    }
  }

  async function confirmMcpUpdate(request: ConfigConfirmMcpRequest): Promise<ConfigConfirmMcpResponse> {
    return confirmMcpUpdateWithRefresh({
      request,
      configBusy,
      setConfigBusy,
      setConfigError,
      acceptMcpUpdate: (nextRequest) => api.configAcceptMcpUpdates(nextRequest),
      refreshConfigCheck: (options) => runConfigCheck(options),
      deriveStaleState: () => deriveIgnorePreflightState(),
      applyStaleState: (stale) => {
        setUpdates(stale.updates);
        setConfigDialogOpen(stale.dialogOpen);
      },
    });
  }

  async function onCheckRegistryExternalDiff(client: Client) {
    setRegistryFlowBusy(true);
    setRegistryFlowError(null);
    try {
      const next = await api.mcpCheckRegistryExternalDiff({ client });
      setRegistryDiff(next);
      if (settings?.mcp_diff_check_mode === "summary_only") {
        setRegistryDiffDialogOpen(false);
        setRegistrySummaryDialogOpen(true);
      } else if (settings?.mcp_diff_check_mode === "open_diff" || !settings?.mcp_diff_check_mode) {
        setRegistrySummaryDialogOpen(false);
        setRegistryDiffDialogOpen(true);
      }
    } catch (e) {
      setRegistryFlowError(e as AppError);
    } finally {
      setRegistryFlowBusy(false);
    }
  }

  async function onPreviewSyncRegistryToExternal(client: Client) {
    return api.mcpPreviewSyncRegistryToExternal({ client });
  }

  async function onApplySyncRegistryToExternal(payload: { client: Client; expected_files: FilePrecondition[] }) {
    setRegistryFlowBusy(true);
    setRegistryFlowError(null);
    try {
      await api.mcpApplySyncRegistryToExternal(payload);
      setRegistryDiff(null);
      setRegistryDiffDialogOpen(false);
      setRegistrySummaryDialogOpen(false);
      setReloadToken((value) => value + 1);
    } catch (e) {
      setRegistryFlowError(e as AppError);
      throw e;
    } finally {
      setRegistryFlowBusy(false);
    }
  }

  // MCP管理页面的操作按钮
  const mcpPageActions: PageHeaderAction[] = [
    { icon: "refresh", label: "检测差异", onClick: () => navigate("mcp") }, // TODO: 实际逻辑
    { icon: "save", label: "写入配置", onClick: () => console.log("写入配置") },
    { icon: "plus", label: "添加", onClick: () => navigate("mcp") },
  ];

  // Skill管理页面的操作按钮
  const skillPageActions: PageHeaderAction[] = [
    { icon: "refresh", label: "检测差异", onClick: () => navigate("skills") }, // TODO: 实际逻辑
    { icon: "save", label: "写入配置", onClick: () => console.log("写入配置") },
    { icon: "download", label: "安装", onClick: () => navigate("skills") },
  ];

  return (
    <TopNavShell route={route} onNavigate={navigate}>
      {route === "dashboard" ? (
        <Dashboard
          onNavigate={navigate}
          mcpCount={mcpCount}
          mcpActiveCount={mcpActiveCount}
          skillCount={skillCount}
          skillInstalledCount={skillInstalledCount}
        />
      ) : null}

      {route === "mcp" ? (
        <>
          <PageHeader
            title="MCP管理"
            kicker="开关、详情与状态"
            actions={mcpPageActions}
            onBack={() => navigate("dashboard")}
          />
          <ServersPage
            onCheckConfigUpdates={runConfigCheck}
            configCheckBusy={configBusy}
            onCheckRegistryExternalDiff={onCheckRegistryExternalDiff}
            onPreviewSyncRegistryToExternal={onPreviewSyncRegistryToExternal}
            onApplySyncRegistryToExternal={onApplySyncRegistryToExternal}
            reloadToken={reloadToken}
          />
        </>
      ) : null}

      {route === "skills" ? (
        <>
          <PageHeader
            title="Skill管理"
            kicker="Codex skills / Claude 命令"
            actions={skillPageActions}
            onBack={() => navigate("dashboard")}
          />
          <SkillsPage />
        </>
      ) : null}

      {route === "settings" ? (
        <>
          <PageHeader
            title="设置"
            onBack={() => navigate("dashboard")}
          />
          <SettingsTabs
            tabs={[
              {
                key: "profiles",
                label: "配置方案",
                content: <ProfilesPage />,
              },
              {
                key: "backups",
                label: "备份回滚",
                content: <BackupsPage />,
              },
              {
                key: "preferences",
                label: "界面设置",
                content: (
                  <SettingsPageContent
                    settings={settings}
                    busy={settingsBusy}
                    error={settingsError}
                    onSave={saveSettings}
                  />
                ),
              },
            ]}
          />
        </>
      ) : null}

      <ConfigChangeDialog
        updates={updates}
        open={configDialogOpen}
        busy={configBusy}
        onClose={() => setConfigDialogOpen(false)}
        onIgnore={ignoreConfigUpdates}
        onConfirmMcp={confirmMcpUpdate}
      />
      <McpConfigDiffDialog
        diff={registryDiff}
        open={registryDiffDialogOpen}
        busy={registryFlowBusy}
        onClose={() => setRegistryDiffDialogOpen(false)}
      />
      <McpConfigDiffSummaryDialog
        diff={registryDiff}
        open={registrySummaryDialogOpen}
        busy={registryFlowBusy}
        onClose={() => setRegistrySummaryDialogOpen(false)}
        onViewDiff={() => {
          if (!registryDiff?.has_diff) return;
          setRegistrySummaryDialogOpen(false);
          setRegistryDiffDialogOpen(true);
        }}
      />
      {configError ? (
        <div
          className="ui-error"
          style={{ position: "fixed", right: "20px", bottom: "20px", maxWidth: "460px", zIndex: 120 }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{configError.code}</div>
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{configError.message}</div>
        </div>
      ) : null}
      {registryFlowError ? (
        <div
          className="ui-error"
          style={{ position: "fixed", left: "20px", bottom: "20px", maxWidth: "460px", zIndex: 120 }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{registryFlowError.code}</div>
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{registryFlowError.message}</div>
        </div>
      ) : null}
    </TopNavShell>
  );
}

function readRouteFromHash(): RouteKey | null {
  const h = window.location.hash || "";
  const match = h.match(/^#\/?(dashboard|mcp|skills|settings)?$/);
  if (!match) return null;
  const path = match[1] || "dashboard";
  if (path === "dashboard" || path === "mcp" || path === "skills" || path === "settings") {
    return path;
  }
  return "dashboard";
}

export default App;
```

- [ ] **Step 3: 运行开发服务器检查编译错误**

```bash
cd app-v2 && npm run dev
```

Expected: 开发服务器启动，无类型错误

- [ ] **Step 4: 提交变更**

```bash
git add app-v2/src/App.tsx
git commit -m "feat(app): refactor to use TopNavShell and new routing structure"
```

---

## Task 10: 适配 ServersPage 移除原有标题

**Files:**
- Modify: `app-v2/src/pages/ServersPage.tsx`

- [ ] **Step 1: 查看 ServersPage 内容以了解结构调整**

```bash
head -50 app-v2/src/pages/ServersPage.tsx
```

注意：ServersPage 可能不需要修改，因为页面标题现在由 PageHeader 提供。但如果 ServersPage 内部有重复的标题结构，需要移除。

- [ ] **Step 2: 检查并移除 ServersPage 中的页面标题**

如果 ServersPage 内部包含 `.ui-pageHeader` 或类似的标题结构，将其移除，只保留内容表格部分。

根据现有代码，ServersPage 可能直接从内容开始，不需要额外修改。

- [ ] **Step 3: 提交变更（如有修改）**

```bash
git add app-v2/src/pages/ServersPage.tsx
git commit -m "refactor(servers): remove redundant page header, now handled by PageHeader"
```

---

## Task 11: 适配 SkillsPage 移除原有标题

**Files:**
- Modify: `app-v2/src/pages/SkillsPage.tsx`

- [ ] **Step 1: 查看 SkillsPage 内容**

```bash
head -50 app-v2/src/pages/SkillsPage.tsx
```

- [ ] **Step 2: 检查并移除 SkillsPage 中的页面标题**

类似 ServersPage，如果有重复的标题结构需要移除。

- [ ] **Step 3: 提交变更（如有修改）**

```bash
git add app-v2/src/pages/SkillsPage.tsx
git commit -m "refactor(skills): remove redundant page header, now handled by PageHeader"
```

---

## Task 12: 更新响应式样式

**Files:**
- Modify: `app-v2/src/styles/ui.css`

- [ ] **Step 1: 更新媒体查询适配顶部导航**

找到 `@media (max-width: 920px)` 部分（约第 818 行），修改为适配顶部导航：

```css
@media (max-width: 920px) {
  .ui-shell {
    height: auto;
    min-height: 0;
    grid-template-rows: auto 1fr;
    overflow: visible;
  }

  .ui-topbar {
    height: auto;
    padding: var(--space-md);
    flex-wrap: wrap;
  }

  .ui-topbarBrand {
    width: 100%;
    justify-content: space-between;
    margin-bottom: var(--space-sm);
  }

  .ui-topbarNav {
    width: 100%;
    justify-content: center;
  }

  .ui-topbarNavItem {
    flex: 1;
    justify-content: center;
  }

  .ui-main {
    grid-column: auto;
    grid-row: auto;
    height: auto;
    overflow-y: visible;
    padding: var(--space-xl);
  }

  .ui-pageHeaderBar {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
    height: auto;
    padding: var(--space-md);
  }

  .ui-pageHeaderActions {
    width: 100%;
    flex-wrap: wrap;
  }

  .ui-dashboardStats {
    grid-template-columns: 1fr;
  }

  .ui-quickActionGrid {
    grid-template-columns: 1fr;
  }

  .ui-card {
    grid-column: 1 / -1;
  }

  .ui-field {
    grid-column: 1 / -1;
  }

  /* Tooltip 在小屏幕上的调整 */
  .ui-tooltipHost[data-tooltip]::after {
    left: 10px;
    right: 10px;
    bottom: calc(100% + 10px);
    width: auto;
    max-width: none;
    transform: translateY(4px);
  }

  .ui-tooltipHost[data-tooltip]:hover::after,
  .ui-tooltipHost[data-tooltip]:focus-within::after {
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: 提交变更**

```bash
git add app-v2/src/styles/ui.css
git commit -m "feat(styles): update responsive styles for top navigation layout"
```

---

## Task 13: 标记 AppShell 为废弃

**Files:**
- Modify: `app-v2/src/components/AppShell.tsx`

- [ ] **Step 1: 在 AppShell.tsx 顶部添加废弃注释**

```tsx
/**
 * @deprecated 此组件已被 TopNavShell 替代
 * 保留此文件仅供参考，将在后续版本中移除
 */
import { useMemo } from "react";
// ... 其余代码保持不变
```

在文件最顶部添加上述注释。

- [ ] **Step 2: 提交变更**

```bash
git add app-v2/src/components/AppShell.tsx
git commit -m "deprecate: mark AppShell as deprecated, replaced by TopNavShell"
```

---

## Task 14: 最终测试与验证

**Files:**
- None (testing task)

- [ ] **Step 1: 启动开发服务器**

```bash
cd app-v2 && npm run dev
```

- [ ] **Step 2: 验证首页仪表盘**

检查项：
- [ ] 顶部导航显示项目名称和设置图标
- [ ] 顶部导航显示 MCP管理 和 Skill管理 按钮
- [ ] 仪表盘显示 MCP 概览和 Skill 概览卡片
- [ ] 仪表盘显示快速操作按钮
- [ ] 仪表盘显示最近活动列表

- [ ] **Step 3: 验证 MCP管理页面**

检查项：
- [ ] 点击 MCP管理 按钮跳转到 MCP管理页面
- [ ] 顶部显示返回按钮、页面标题、操作按钮组
- [ ] MCP列表正常显示
- [ ] 点击返回按钮返回首页

- [ ] **Step 4: 验证 Skill管理页面**

检查项：
- [ ] 点击 Skill管理 按钮跳转到 Skill管理页面
- [ ] 顶部显示返回按钮、页面标题、操作按钮组
- [ ] Skill列表正常显示
- [ ] 点击返回按钮返回首页

- [ ] **Step 5: 验证设置页面**

检查项：
- [ ] 点击设置图标跳转到设置页面
- [ ] 顶部显示返回按钮和标题
- [ ] Tab切换正常工作（配置方案、备份回滚、界面设置）
- [ ] 点击返回按钮返回首页

- [ ] **Step 6: 验证路由URL**

检查项：
- [ ] 首页 URL 为 `#/` 或 `#`
- [ ] MCP管理 URL 为 `#/mcp`
- [ ] Skill管理 URL 为 `#/skills`
- [ ] 设置 URL 为 `#/settings`
- [ ] 浏览器前进/后退按钮正常工作

- [ ] **Step 7: 验证响应式布局**

检查项：
- [ ] 缩小浏览器窗口，导航栏适配为垂直布局
- [ ] 主内容区域正常显示

- [ ] **Step 8: 运行类型检查**

```bash
cd app-v2 && npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 9: 提交最终变更**

```bash
git add -A
git commit -m "test: complete UI refactor validation, all features working"
```

---

## 实施完成检查清单

- [ ] Task 1: Icon 组件扩展完成
- [ ] Task 2: TopbarBrand 组件创建完成
- [ ] Task 3: TopbarNav 组件创建完成
- [ ] Task 4: PageHeader 组件创建完成
- [ ] Task 5: TopNavShell 组件创建完成
- [ ] Task 6: 顶部导航样式添加完成
- [ ] Task 7: Dashboard 组件创建完成
- [ ] Task 8: SettingsTabs 组件创建完成
- [ ] Task 9: App.tsx 重构完成
- [ ] Task 10: ServersPage 适配完成
- [ ] Task 11: SkillsPage 适配完成
- [ ] Task 12: 响应式样式更新完成
- [ ] Task 13: AppShell 标记为废弃
- [ ] Task 14: 最终测试验证完成

---

## 后续优化建议

1. **Dashboard 数据集成**：将统计数据从 API 获取，而非使用模拟数据
2. **最近活动数据**：实现活动日志记录和展示功能
3. **操作按钮逻辑**：完善"检测差异"、"写入配置"等按钮的实际功能
4. **动画过渡**：添加页面切换时的过渡动画
5. **键盘快捷键**：支持键盘导航快捷键（如 `Ctrl+K` 打开快速导航）
6. **主题切换**：在界面设置中添加暗色模式支持
