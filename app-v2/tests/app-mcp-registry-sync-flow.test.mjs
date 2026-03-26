import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const diffDialogSource = readFileSync(new URL('../src/components/McpConfigDiffDialog.tsx', import.meta.url), 'utf8');

test('App 基于 settings.mcp_diff_check_mode 在 diff 与 summary 弹窗间切换', () => {
  assert.match(appSource, /settings\?\.mcp_diff_check_mode/);
  assert.match(appSource, /McpConfigDiffDialog/);
  assert.match(appSource, /McpConfigDiffSummaryDialog/);
  assert.match(appSource, /open_diff/);
  assert.match(appSource, /summary_only/);
});

test('App 为 registry diff 新流程维护独立状态，不复用旧 config 检查弹窗状态', () => {
  assert.match(appSource, /registryDiffDialogOpen/);
  assert.match(appSource, /registrySummaryDialogOpen/);
  assert.match(appSource, /registryDiff/);
  assert.match(appSource, /registryFlowBusy/);
  assert.match(appSource, /reloadToken/);
  assert.match(appSource, /configDialogOpen/);
  assert.match(appSource, /updates/);
  assert.match(appSource, /configBusy/);
});

test('App 向 ServersPage 透传 registry 检测与写回流程回调', () => {
  assert.match(appSource, /onCheckRegistryExternalDiff/);
  assert.match(appSource, /onPreviewSyncRegistryToExternal/);
  assert.match(appSource, /onApplySyncRegistryToExternal/);
  assert.match(appSource, /reloadToken=\{reloadToken\}/);
});

test('App 的 summary 弹窗在有差异时可切到完整 diff 弹窗', () => {
  assert.match(appSource, /onViewDiff/);
  assert.match(appSource, /has_diff/);
});

test('McpConfigDiffDialog 在打开新结果或切换 client 时重置视图状态', () => {
  assert.match(diffDialogSource, /useEffect/);
  assert.match(diffDialogSource, /setMode\("unified"\)/);
  assert.match(diffDialogSource, /setWrap\(false\)/);
  assert.match(diffDialogSource, /\[open,\s*diff\?\.client,\s*diff\?\.diff_unified\]/);
});
