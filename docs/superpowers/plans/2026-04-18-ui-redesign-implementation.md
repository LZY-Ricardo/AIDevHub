# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `app-v2` 现有桌面端界面升级为与 `ui-redesign.pen` 对齐的产品化工作台视觉体系，并先完成全局骨架、Dashboard、Settings、Backups 和核心弹层外观重构。

**Architecture:** 先重构设计 token 和通用壳层，再让页面逐步迁移到统一的“摘要区 + 主工作区 + 侧板/弹窗”结构。优先做可复用样式与页面配置，尽量避免在大页面内继续堆叠不可维护的内联样式。

**Tech Stack:** React 19、TypeScript、现有 `ui.css/theme.css`、Tauri 前端、Node 内置测试、`pnpm build`

---

### Task 1: 建立页面配置与测试支点

**Files:**
- Create: `app-v2/src/lib/pageContent.ts`
- Create: `app-v2/tests/page-content.test.mjs`
- Modify: `app-v2/src/App.tsx`

- [ ] **Step 1: 写一个失败测试，约束页面头部与 Dashboard 文案配置**
- [ ] **Step 2: 运行测试，确认因缺少模块而失败**
- [ ] **Step 3: 提取 `pageContent.ts`，集中管理页面标题、kicker、快捷动作和 Dashboard 文案**
- [ ] **Step 4: 让 `App.tsx` 与 `Dashboard.tsx` 使用新配置**
- [ ] **Step 5: 重新运行测试，确认通过**

### Task 2: 重做全局主题与壳层样式

**Files:**
- Modify: `app-v2/src/styles/theme.css`
- Modify: `app-v2/src/styles/ui.css`
- Modify: `app-v2/src/components/TopNavShell.tsx`
- Modify: `app-v2/src/components/TopbarBrand.tsx`
- Modify: `app-v2/src/components/TopbarNav.tsx`

- [ ] **Step 1: 写一个失败测试，约束页面配置里新的导航标签和 Dashboard 主文案**
- [ ] **Step 2: 运行测试，确认失败原因正确**
- [ ] **Step 3: 更新 `theme.css` token，切换到蓝灰产品化主题**
- [ ] **Step 4: 更新 `ui.css` 顶部导航、主容器、卡片、按钮和表格基础样式**
- [ ] **Step 5: 微调 `TopNavShell / TopbarBrand / TopbarNav` 结构，使其匹配新视觉层级**
- [ ] **Step 6: 运行测试与构建，确认配置测试通过且前端可编译**

### Task 3: 实现 Dashboard 工作台布局

**Files:**
- Modify: `app-v2/src/components/Dashboard.tsx`
- Modify: `app-v2/src/components/StatCard.tsx`
- Modify: `app-v2/src/components/QuickActionButton.tsx`
- Modify: `app-v2/src/components/ActivityList.tsx`
- Modify: `app-v2/src/styles/ui.css`

- [ ] **Step 1: 写一个失败测试，约束 Dashboard 使用新的工作台文案与模块标题**
- [ ] **Step 2: 运行测试并确认失败**
- [ ] **Step 3: 将 Dashboard 重构为“Hero + KPI + Runtime/Assets + Activity/Recovery”结构**
- [ ] **Step 4: 同步重做相关卡片和活动列表样式**
- [ ] **Step 5: 运行测试与构建，确认通过**

### Task 4: 实现 Settings 与 Backups 主页面重构

**Files:**
- Modify: `app-v2/src/pages/SettingsPage.tsx`
- Modify: `app-v2/src/pages/BackupsPage.tsx`
- Modify: `app-v2/src/styles/ui.css`

- [ ] **Step 1: 写一个失败测试，约束 Settings / Backups 页面配置文案与分组标签**
- [ ] **Step 2: 运行测试并确认失败**
- [ ] **Step 3: 将 Settings 改成“侧边分组 + 主设置卡 + 保存反馈”结构**
- [ ] **Step 4: 将 Backups 改成“摘要 + 筛选 + 时间线/表格 + 风险提示”结构**
- [ ] **Step 5: 运行测试与构建，确认通过**

### Task 5: 重做 Skills 页面头部和详情弹层外观

**Files:**
- Modify: `app-v2/src/pages/SkillsPage.tsx`
- Modify: `app-v2/src/styles/ui.css`

- [ ] **Step 1: 写一个失败测试，约束 Skills 页面头部和详情标题使用新配置/新文案**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 先改 Skills 顶部摘要、过滤条和详情抽屉视觉层级，不动核心数据流**
- [ ] **Step 4: 将 Skill / Repo Skill 详情弹层风格对齐设计稿**
- [ ] **Step 5: 运行测试与构建，确认通过**

### Task 6: 重做通用弹窗与侧板体系

**Files:**
- Modify: `app-v2/src/components/Dialog.tsx`
- Modify: `app-v2/src/components/WritePreviewDialog.tsx`
- Modify: `app-v2/src/components/McpConfigDiffDialog.tsx`
- Modify: `app-v2/src/components/McpConfigDiffSummaryDialog.tsx`
- Modify: `app-v2/src/styles/ui.css`

- [ ] **Step 1: 写一个失败测试，约束预览/差异类弹窗标题文本与动作文案来源**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 更新通用 dialog overlay / panel / footer 样式**
- [ ] **Step 4: 让写入预览、回滚预览、差异弹窗统一成产品化弹层风格**
- [ ] **Step 5: 运行测试与构建，确认通过**

### Task 7: 最终验证

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-ui-redesign-implementation.md`

- [ ] **Step 1: 运行 `node --test app-v2/tests/page-content.test.mjs`**
- [ ] **Step 2: 运行 `pnpm build`（工作目录 `app-v2`）**
- [ ] **Step 3: 记录通过结果与残留风险**
