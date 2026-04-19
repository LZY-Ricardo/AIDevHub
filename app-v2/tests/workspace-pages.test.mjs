import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backupsSource = readFileSync(
  new URL("../src/pages/BackupsPage.tsx", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("../src/pages/SettingsPage.tsx", import.meta.url),
  "utf8",
);
const uiCssSource = readFileSync(
  new URL("../src/styles/ui.css", import.meta.url),
  "utf8",
);

test("Backups 页面具备恢复中心摘要与时间线结构", () => {
  assert.match(backupsSource, /恢复中心/);
  assert.match(backupsSource, /ui-pageSummary/);
  assert.match(backupsSource, /ui-timeline/);
  assert.match(backupsSource, /回滚提示/);
});

test("Settings 页面具备分组侧栏与保存状态反馈", () => {
  assert.match(settingsSource, /设置分组/);
  assert.match(settingsSource, /保存状态/);
  assert.match(settingsSource, /ui-settingsWorkspace/);
  assert.match(settingsSource, /ui-settingsMenu/);
  assert.match(settingsSource, /ui-settingsMenuItemStatic/);
  assert.match(settingsSource, /ui-settingsMenuItemActive ui-settingsMenuItemStatic/);
  assert.doesNotMatch(settingsSource, /<button type="button" className="ui-settingsMenuItem ui-settingsMenuItemActive">/);
  assert.doesNotMatch(settingsSource, /<button type="button" className="ui-settingsMenuItem">\s*界面偏好/);
  assert.doesNotMatch(settingsSource, /<button type="button" className="ui-settingsMenuItem">\s*风险确认/);
});

test("工作台布局在窄窗下会折叠成单列", () => {
  assert.match(uiCssSource, /@media \(max-width: 920px\)[\s\S]*\.ui-pageSummaryGrid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(uiCssSource, /@media \(max-width: 920px\)[\s\S]*\.ui-workspaceLayout\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(uiCssSource, /@media \(max-width: 920px\)[\s\S]*\.ui-settingsWorkspace\s*\{[\s\S]*grid-template-columns:\s*1fr/);
});
