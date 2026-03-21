import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/components/AppShell.tsx', import.meta.url), 'utf8');


test('应用默认进入 MCP 管理页', () => {
  assert.match(appSource, /readRouteFromHash\(\) \?\? "servers"/);
});

test('应用不再渲染总览页组件', () => {
  assert.doesNotMatch(appSource, /OverviewPage/);
  assert.doesNotMatch(appSource, /route === "overview"/);
});

test('侧边导航不再提供总览入口', () => {
  assert.doesNotMatch(shellSource, /key: "overview"/);
  assert.doesNotMatch(shellSource, /label: "总览"/);
});
