import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('App 启动时自动触发 configCheckUpdates', () => {
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*runConfigCheck\(\)/);
  assert.match(source, /api\.configCheckUpdates\(\)/);
});

test('App 在 StrictMode 重挂载下通过模块级哨兵避免重复触发启动检查', () => {
  assert.match(source, /let\s+startupConfigCheckBootstrapped\s*=\s*false/);
  assert.match(source, /if\s*\(\s*startupConfigCheckBootstrapped\s*\)\s*return;/);
  assert.match(source, /startupConfigCheckBootstrapped\s*=\s*true/);
  assert.doesNotMatch(source, /startupCheckTriggeredRef/);
});

test('App 维护统一的配置检查入口并向 ServersPage 透传', () => {
  assert.match(source, /function\s+runConfigCheck\s*\(/);
  assert.match(source, /<ServersPage\s+onCheckConfigUpdates=\{runConfigCheck\}/);
  assert.match(source, /configCheckBusy=\{configBusy\}/);
});

test('App 持有全局配置变更弹窗状态并渲染 ConfigChangeDialog', () => {
  assert.match(source, /ConfigChangeDialog/);
  assert.match(source, /configDialogOpen/);
  assert.match(source, /updates/);
});

test('App 通过请求协调器防止旧响应覆盖新状态且正确维护 busy', () => {
  assert.match(source, /createRequestCoordinator/);
  assert.match(source, /configCheckFlow\.begin\(\)/);
  assert.match(source, /if\s*\(\s*!configCheckFlow\.isLatest\(requestId\)\s*\)\s*return;/);
  assert.match(source, /setConfigBusy\(configCheckFlow\.end\(requestId\)\)/);
});

test('App 在忽略失败后会失效当前 diff 并触发刷新', () => {
  assert.match(source, /deriveIgnorePreflightState/);
  assert.match(source, /setUpdates\(preflight\.updates\)/);
  assert.match(source, /setConfigDialogOpen\(preflight\.dialogOpen\)/);
  assert.match(source, /shouldRefreshAfterIgnore/);
  assert.match(source, /await\s+runConfigCheck\(\)/);
});

test('App 的确认 MCP 动作走真实后端并在成功后刷新检测结果', () => {
  assert.match(source, /confirmMcpUpdateWithRefresh/);
  assert.match(source, /acceptMcpUpdate:\s*\(nextRequest\)\s*=>\s*api\.configAcceptMcpUpdates\(nextRequest\)/);
  assert.match(source, /refreshConfigCheck:\s*\(options\)\s*=>\s*runConfigCheck\(options\)/);
  assert.doesNotMatch(source, /buildConfirmPlaceholderResponse/);
});

test('App 的确认 MCP 失败会设置 configError 并返回 accepted=false 响应', () => {
  assert.match(source, /setConfigError/);
  assert.match(source, /confirmMcpUpdateWithRefresh/);
});

test('App 在 accept 成功但 refresh 失败时会失效旧 diff，避免继续操作过期数据', () => {
  assert.match(source, /applyStaleState:\s*\(stale\)\s*=>\s*\{/);
  assert.match(source, /setUpdates\(stale\.updates\)/);
  assert.match(source, /setConfigDialogOpen\(stale\.dialogOpen\)/);
});
