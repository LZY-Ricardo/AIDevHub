import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/AppShell.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../src/lib/types.ts", import.meta.url), "utf8");
const settingsPageUrl = new URL("../src/pages/SettingsPage.tsx", import.meta.url);
const pageSource = existsSync(settingsPageUrl) ? readFileSync(settingsPageUrl, "utf8") : "";
const loadSettingsBlock = (appSource.match(/async function loadSettings\(\) \{[\s\S]*?\n  \}/) ?? [""])[0];
const saveSettingsBlock = (appSource.match(/async function saveSettings\(next: AppSettings\) \{[\s\S]*?\n  \}/) ?? [""])[0];

test("设置页路由被加入应用与侧边栏", () => {
  assert.match(shellSource, /"settings"/);
  assert.match(shellSource, /label: "设置"/);
  assert.match(appSource, /route === "settings"/);
  assert.match(appSource, /readRouteFromHash[\s\S]*settings/);
});

test("应用启动时加载 settings 并向设置页传入保存回调", () => {
  assert.match(appSource, /api\.settingsGet\(\)/);
  assert.match(appSource, /api\.settingsPut\(/);
  assert.match(appSource, /<SettingsPage[\s\S]*settings=/);
  assert.match(appSource, /onSave=/);
});

test("settings 流程维护独立错误状态且加载失败时不伪造已加载配置", () => {
  assert.match(appSource, /const \[settingsError, setSettingsError\] = useState<AppError \| null>\(null\);/);
  assert.doesNotMatch(appSource, /setSettings\(DEFAULT_SETTINGS\)/);
  assert.match(loadSettingsBlock, /setSettingsError\(null\)/);
  assert.match(saveSettingsBlock, /setSettingsError\(null\)/);
  assert.doesNotMatch(loadSettingsBlock, /setConfigError/);
  assert.doesNotMatch(saveSettingsBlock, /setConfigError/);
});

test("API 暴露 settingsGet 与 settingsPut", () => {
  assert.match(apiSource, /settingsGet\(\): Promise<AppSettings>/);
  assert.match(apiSource, /settingsPut\(payload: AppSettings\): Promise<AppSettings>/);
  assert.match(apiSource, /invokeCmd(?:<Partial<AppSettings>>)?\("settings_get"\)/);
  assert.match(apiSource, /invokeCmd(?:<Partial<AppSettings>>)?\("settings_put", payload\)/);
});

test("settings API 会对后端返回值做归一化", () => {
  assert.match(apiSource, /function normalizeAppSettings/);
  assert.match(apiSource, /settingsGet\(\): Promise<AppSettings>[\s\S]*then\(normalizeAppSettings\)/);
  assert.match(apiSource, /settingsPut\(payload: AppSettings\): Promise<AppSettings>[\s\S]*then\(normalizeAppSettings\)/);
});

test("类型定义包含 AppSettings 与 McpDiffCheckMode", () => {
  assert.match(typesSource, /export type McpDiffCheckMode = "open_diff" \| "summary_only";/);
  assert.match(typesSource, /export interface AppSettings/);
  assert.match(typesSource, /mcp_diff_check_mode: McpDiffCheckMode;/);
});

test("设置页展示 MCP 差异检测结果方式选项", () => {
  assert.equal(existsSync(settingsPageUrl), true);
  assert.match(pageSource, /MCP 差异检测结果展示方式/);
  assert.match(pageSource, /open_diff/);
  assert.match(pageSource, /summary_only/);
});

test("设置页在 settings 未加载成功时禁止保存并展示独立错误", () => {
  assert.match(pageSource, /disabled=\{busy \|\| !settings\}/);
  assert.match(pageSource, /error\?: AppError \| null/);
  assert.match(pageSource, /error \? \(/);
});
