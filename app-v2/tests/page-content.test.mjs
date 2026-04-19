import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pageContentUrl = new URL("../src/lib/pageContent.ts", import.meta.url);
const dashboardUrl = new URL("../src/components/Dashboard.tsx", import.meta.url);
const appUrl = new URL("../src/App.tsx", import.meta.url);

const pageContentSource = existsSync(pageContentUrl) ? readFileSync(pageContentUrl, "utf8") : "";
const dashboardSource = readFileSync(dashboardUrl, "utf8");
const appSource = readFileSync(appUrl, "utf8");
const navSource = readFileSync(new URL("../src/components/TopbarNav.tsx", import.meta.url), "utf8");

test("页面内容配置模块存在并导出新的导航标签与 MCP 页面动作", () => {
  assert.equal(existsSync(pageContentUrl), true);
  assert.match(pageContentSource, /export const topLevelNavItems/);
  assert.match(pageContentSource, /label: "总览"/);
  assert.match(pageContentSource, /label: "MCP"/);
  assert.match(pageContentSource, /label: "Skills"/);
  assert.match(pageContentSource, /label: "偏好"/);
  assert.match(pageContentSource, /export const pageHeaderContent/);
  assert.match(pageContentSource, /title: "MCP 管理"/);
  assert.match(pageContentSource, /label: "新增 MCP"/);
});

test("Dashboard 使用新的工作台文案配置", () => {
  assert.match(pageContentSource, /export const dashboardContent/);
  assert.match(pageContentSource, /统一管理 MCP 运行、技能资产、备份恢复与系统偏好/);
  assert.match(dashboardSource, /dashboardContent/);
  assert.match(dashboardSource, /运行工作区/);
  assert.match(dashboardSource, /恢复中心/);
  assert.match(dashboardSource, /onWriteConfig: \(\) => void/);
});

test("App 使用页面内容配置构建页面头部", () => {
  assert.match(appSource, /pageHeaderContent/);
  assert.match(appSource, /pageHeader=\{activePageHeader/);
  assert.match(appSource, /onWriteConfig=\{\(\) => \{/);
  assert.match(appSource, /navigate\("mcp"\)/);
  assert.match(appSource, /setWriteConfigTrigger/);
});

test("顶部导航只渲染真正可点击的 MCP 和 Skills 入口", () => {
  assert.match(navSource, /item\.key === "mcp" \|\| item\.key === "skills"/);
  assert.doesNotMatch(navSource, /dashboard: \(\) => undefined/);
  assert.doesNotMatch(navSource, /settings: \(\) => undefined/);
});
