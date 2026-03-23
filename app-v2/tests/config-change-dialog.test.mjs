import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ConfigChangeDialog.tsx', import.meta.url), 'utf8');

test('配置变更对话框复用 Dialog 容器', () => {
  assert.match(source, /import\s+\{\s*Dialog\s*\}\s+from\s+"\.\/Dialog"/);
});

test('配置变更对话框主标题强调检测到外部配置文件已更新', () => {
  assert.match(source, /title="检测到外部配置文件已更新"/);
});

test('配置变更对话框复用 DiffViewer 展示 unified diff', () => {
  assert.match(source, /import\s+\{\s*DiffViewer/);
  assert.match(source, /mode=\{mode\}/);
});

test('配置变更对话框按逻辑来源分组', () => {
  assert.match(source, /groupedBySource/);
  assert.match(source, /source_id/);
});

test('配置变更对话框提供三种动作按钮', () => {
  assert.match(source, /确认更新 MCP/);
  assert.match(source, /忽略本次变化/);
  assert.match(source, /关闭/);
});

test('确认更新 MCP 通过 buildConfirmMcpRequest 构建请求并在禁用时提示能力边界', () => {
  assert.match(source, /disabled=\{[^}]*confirm/);
  assert.match(source, /buildConfirmMcpRequest/);
  assert.match(source, /onConfirmMcp\(confirmRequest\)/);
  assert.doesNotMatch(source, /当前版本尚未提供前端可用的确认更新能力/);
});
