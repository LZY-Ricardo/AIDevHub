import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('../src/pages/ServersPage.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../src/lib/types.ts', import.meta.url), 'utf8');

test('ServersPage 顶部提供当前 client 的项目与本地差异检测按钮', () => {
  assert.match(pageSource, /检测项目与本地差异/);
  assert.match(pageSource, /onCheckRegistryExternalDiff/);
  assert.match(pageSource, /onCheckRegistryExternalDiff\(client\)/);
});

test('ServersPage 顶部提供当前 client 的项目内 MCP 写回本地按钮', () => {
  assert.match(pageSource, /写入项目内 MCP 到本地/);
  assert.match(pageSource, /onPreviewSyncRegistryToExternal/);
  assert.match(pageSource, /onApplySyncRegistryToExternal/);
  assert.match(pageSource, /client:\s*client/);
  assert.match(pageSource, /WritePreviewDialog/);
});

test('ServersPage 为新流程维护独立状态而不是复用旧配置检查状态', () => {
  assert.match(pageSource, /registrySyncPreview/);
  assert.match(pageSource, /registryPreviewOpen/);
  assert.match(pageSource, /registryBusy/);
  assert.doesNotMatch(pageSource, /configDialogOpen/);
  assert.doesNotMatch(pageSource, /updates\s*=/);
});

test('ServersPage 支持通过 reload token 刷新当前服务器列表', () => {
  assert.match(pageSource, /reloadToken/);
  assert.match(pageSource, /useEffect\(\(\) => \{\s*void load\(\);\s*\}, \[client,\s*reloadToken\]\)/);
});

test('ServersPage 通过请求协调器防止旧 client 列表覆盖当前列表', () => {
  assert.match(pageSource, /createRequestCoordinator/);
  assert.match(pageSource, /const listLoadFlow = useMemo\(\(\) => createRequestCoordinator\(\), \[\]\)/);
  assert.match(pageSource, /const requestId = listLoadFlow\.begin\(\)/);
  assert.match(pageSource, /if \(!listLoadFlow\.isLatest\(requestId\)\) return;/);
});

test('ServersPage 绑定预览写回时的 client，避免确认阶段串到当前选择器', () => {
  assert.match(pageSource, /registryPreviewClient/);
  assert.match(pageSource, /setRegistryPreviewClient\(client\)/);
  assert.match(pageSource, /onApplySyncRegistryToExternal\(\{ client: registryPreviewClient, expected_files \}\)/);
  assert.doesNotMatch(pageSource, /onApplySyncRegistryToExternal\(\{ client: client, expected_files \}\)/);
});

test('api 暴露 MCP registry 检测与写回接口', () => {
  assert.match(apiSource, /mcpCheckRegistryExternalDiff/);
  assert.match(apiSource, /invokeCmd\("mcp_check_registry_external_diff"/);
  assert.match(apiSource, /mcpPreviewSyncRegistryToExternal/);
  assert.match(apiSource, /invokeCmd\("mcp_preview_sync_registry_to_external"/);
  assert.match(apiSource, /mcpApplySyncRegistryToExternal/);
  assert.match(apiSource, /invokeCmd\("mcp_apply_sync_registry_to_external"/);
});

test('types 定义 registry diff 响应结构', () => {
  assert.match(typesSource, /export interface McpRegistryExternalDiff/);
  assert.match(typesSource, /has_diff:\s*boolean;/);
  assert.match(typesSource, /client:\s*Client;/);
  assert.match(typesSource, /diff_unified:\s*string;/);
});
