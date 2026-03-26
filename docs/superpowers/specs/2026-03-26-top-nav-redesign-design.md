# 顶部导航栏重构设计文档

**日期**: 2026-03-26
**作者**: Claude
**状态**: 设计阶段

---

## 1. 概述

将现有的左侧边栏导航布局改为顶部导航栏布局，以增加主内容区域的视野空间。新的设计采用两层导航结构：首页仪表盘作为入口，点击后进入具体的管理页面。

### 1.1 当前布局

```
┌────────┬──────────────────────────────────┐
│        │  页面标题                         │
│ 侧边栏  │  副标题                           │
│        │                                  │
│ 导航   │  主内容区域                       │
│        │                                  │
└────────┴──────────────────────────────────┘
  272px
```

### 1.2 目标布局

**首页（仪表盘）：**
```
┌─────────────────────────────────────────────────────┐
│ AIDevHub          │ ⚙️  │  📦  │  ⚡  │
│                   │设置 │ MCP │Skill│
├─────────────────────────────────────────────────────┤
│                                                     │
│  仪表盘内容                                         │
│  - MCP/Skill 概览卡片                               │
│  - 快速操作按钮                                     │
│  - 最近活动                                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**管理页面：**
```
┌─────────────────────────────────────────────────────┐
│ ←  页面名称        │ 操作按钮组                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  主内容区域                                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 2. 路由结构

### 2.1 路由定义

| 路径 | 组件 | 描述 |
|------|------|------|
| `/` | `Dashboard` | 首页仪表盘 |
| `/mcp` | `ServersPage` | MCP管理页面 |
| `/skills` | `SkillsPage` | Skill管理页面 |
| `/settings` | `SettingsPage` | 设置页面 |

### 2.2 导航流程

```
首页 (/)
  ├── 点击 MCP 图标 → MCP管理页面 (/mcp)
  ├── 点击 Skill 图标 → Skill管理页面 (/skills)
  └── 点击 ⚙️ 设置 → 设置页面 (/settings)

各管理页面
  └── 点击 ← 返回 → 首页 (/)
```

---

## 3. 组件设计

### 3.1 组件层次结构

```
App
├── TopNavShell (新增)
│   ├── Topbar (新增)
│   │   ├── TopbarBrand (项目名称 + 设置)
│   │   └── TopbarNav (MCP + Skill 入口)
│   └── MainContent
│       └── {children}
├── PageHeader (新增，第二层页面使用)
│   ├── BackButton
│   ├── PageTitle
│   └── ActionButtons
└── Dialog组件...
```

### 3.2 TopNavShell

**职责**：应用的最外层布局容器，提供顶部导航栏

**Props**：
```tsx
interface TopNavShellProps {
  children: ReactNode;
}
```

**结构**：
```tsx
<div className="ui-shell">
  <header className="ui-topbar">
    <TopbarBrand />
    <TopbarNav />
  </header>
  <main className="ui-main">
    {children}
  </main>
</div>
```

### 3.3 TopbarBrand

**职责**：显示项目名称和设置入口

**结构**：
```tsx
<div className="ui-topbarBrand">
  <h1 className="ui-brandName">AIDevHub</h1>
  <button className="ui-iconBtn" aria-label="设置">
    <Icon name="settings" />
  </button>
</div>
```

### 3.4 TopbarNav

**职责**：首页的主要导航入口

**结构**：
```tsx
<nav className="ui-topbarNav">
  <button className="ui-topbarNavItem" onClick={() => navigate('/mcp')}>
    <Icon name="servers" />
    <span>MCP管理</span>
  </button>
  <button className="ui-topbarNavItem" onClick={() => navigate('/skills')}>
    <Icon name="skills" />
    <span>Skill管理</span>
  </button>
</nav>
```

### 3.5 PageHeader

**职责**：第二层页面的顶部操作栏

**Props**：
```tsx
interface PageHeaderProps {
  title: string;
  kicker?: string;
  actions: Array<{
    icon: Parameters<typeof Icon>[0]["name"];
    label: string;
    onClick: () => void;
  }>;
  onBack?: () => void;
}
```

**结构**：
```tsx
<header className="ui-pageHeader">
  <div className="ui-pageHeaderLeft">
    <button className="ui-backBtn" onClick={onBack}>
      <Icon name="arrowLeft" />
    </button>
    <div>
      <h1 className="ui-pageTitle">{title}</h1>
      {kicker && <div className="ui-pageKicker">{kicker}</div>}
    </div>
  </div>
  <div className="ui-pageHeaderActions">
    {actions.map(action => (
      <button key={action.label} className="ui-iconBtn" onClick={action.onClick}>
        <Icon name={action.icon} />
        <span className="ui-tooltip">{action.label}</span>
      </button>
    ))}
  </div>
</header>
```

### 3.6 Dashboard

**职责**：首页仪表盘，显示概览和快速操作

**内容区块**：
1. **欢迎标题**
2. **概览卡片**（MCP统计、Skill统计）
3. **快速操作**（添加MCP、安装Skill、写入配置）
4. **最近活动**（操作日志）

---

## 4. 页面设计

### 4.1 首页（Dashboard）

**布局**：
```tsx
<div className="ui-dashboard">
  <section className="ui-dashboardWelcome">
    <h1>欢迎使用 AIDevHub</h1>
  </section>

  <section className="ui-dashboardStats">
    <StatCard
      title="MCP 概览"
      icon="servers"
      stats={{ total: 12, active: 10 }}
    />
    <StatCard
      title="Skill 概览"
      icon="skills"
      stats={{ total: 8, installed: 6 }}
    />
  </section>

  <section className="ui-dashboardQuickActions">
    <QuickActionButton icon="plus" label="添加MCP" onClick={() => navigate('/mcp?action=add')} />
    <QuickActionButton icon="download" label="安装Skill" onClick={() => navigate('/skills?action=install')} />
    <QuickActionButton icon="save" label="写入配置" onClick={handleWriteConfig} />
  </section>

  <section className="ui-dashboardActivity">
    <h2>最近活动</h2>
    <ActivityList activities={recentActivities} />
  </section>
</div>
```

### 4.2 MCP管理页面

**顶部栏**：
```
← 返回  MCP管理    [检测差异] [写入配置] [添加]
```

**主内容**：保持现有的 ServersPage 内容

### 4.3 Skill管理页面

**顶部栏**：
```
← 返回  Skill管理  [检测差异] [写入配置] [安装]
```

**主内容**：保持现有的 SkillsPage 内容

### 4.4 设置页面

**顶部栏**：
```
← 返回  设置
```

**Tab切换**：配置方案 | 备份回滚 | 界面设置

**内容**：将现有的三个功能整合到一个页面，通过 Tab 切换

---

## 5. 样式设计

### 5.1 尺寸规范

| 元素 | 高度 | 说明 |
|------|------|------|
| `.ui-topbar` | 64px | 顶部导航栏 |
| `.ui-pageHeader` | 56px | 页面头部（第二层） |
| `.ui-topbarNavItem` | 48px | 导航按钮 |

### 5.2 顶部导航栏样式

```css
.ui-shell {
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

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
  cursor: pointer;
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
  position: relative;
}

.ui-iconBtn:hover {
  background: rgba(var(--color-text-rgb), 0.06);
}
```

### 5.3 页面头部样式

```css
.ui-pageHeader {
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
}

.ui-pageHeaderActions {
  display: flex;
  gap: var(--space-sm);
}
```

---

## 6. 数据流

### 6.1 路由状态

使用 `react-router-dom` 或现有的 hash 路由：

```tsx
// App.tsx
const [location, setLocation] = useState<Location>({
  path: '/',
  params: {}
})

function navigate(path: string) {
  window.location.hash = path
}
```

### 6.2 组件间通信

- Dashboard → 子页面：通过路由跳转
- 操作按钮触发：保持现有的 API 调用逻辑

---

## 7. 实施计划

### 7.1 阶段划分

**阶段1：骨架搭建**
- 创建 `TopNavShell` 组件
- 创建 `TopbarBrand`、`TopbarNav` 组件
- 创建 `PageHeader` 组件
- 添加基础样式

**阶段2：Dashboard开发**
- 创建 `Dashboard` 组件
- 实现概览卡片
- 实现快速操作区
- 实现最近活动列表

**阶段3：页面适配**
- 适配 `ServersPage` 使用 `PageHeader`
- 适配 `SkillsPage` 使用 `PageHeader`
- 重构 `SettingsPage` 支持 Tab 切换

**阶段4：整合测试**
- 路由跳转测试
- 样式响应式测试
- 功能回归测试

### 7.2 兼容性

- 保持现有的 API 调用逻辑不变
- 保持现有的状态管理逻辑不变
- 主要变更在 UI 层

---

## 8. 待确认事项

- [ ] Dashboard 统计数据来源（是否需要新增 API）
- [ ] 最近活动数据的存储和展示方式
- [ ] 响应式设计（小屏幕适配方案）
- [ ] 是否保留原有的 `AppShell` 作为过渡选项

---

## 9. 参考资料

- 现有 `AppShell.tsx` 组件
- 现有 `ui.css` 样式文件
- 用户提供的参考设计图
