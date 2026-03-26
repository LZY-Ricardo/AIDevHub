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

test('配置变更对话框提供同步与通用动作按钮', () => {
  assert.match(source, /同步到项目内 MCP/);
  assert.match(source, /忽略本次变化/);
  assert.match(source, /关闭/);
  assert.doesNotMatch(source, /确认更新 MCP/);
});

test('配置变更对话框概览说明 MCP 与 Skill 的能力边界', () => {
  assert.match(source, /按来源分组。MCP 可同步，Skill 仅查看。共 \{groupedBySource.length\} 组。/);
});

test('配置变更对话框在分组头部决定同步动作', () => {
  assert.match(source, /const groupConfirmRequest = items\.find/);
  assert.match(source, /const groupKind = items\[0\]\?\.kind \?\? "skill"/);
  assert.match(source, /void onConfirmMcp\(groupConfirmRequest\)/);
});

test('Skill 分组不显示行级确认按钮而是展示只读说明', () => {
  assert.match(source, /groupKind === "skill"/);
  assert.match(source, /仅查看/);
  assert.match(source, /将当前外部 MCP 变化同步到项目内部副本，不会回写外部文件。/);
  assert.match(source, /buildConfirmMcpRequest/);
  assert.doesNotMatch(source, /item\.kind === "skill"/);
  assert.doesNotMatch(source, /onConfirmMcp\(confirmRequest\)/);
});

test('配置变更对话框分组头部使用更短标签', () => {
  assert.match(source, /<div className="ui-label">来源<\/div>/);
  assert.match(source, /暂不支持同步/);
});

test('分组右侧状态使用弱化的 pill badge 样式', () => {
  assert.match(source, /className="ui-pill"/);
  assert.match(source, /className="ui-pillDot"/);
  assert.match(source, /className="ui-code ui-pillText"/);
});

test('分组变化计数使用更轻的 badge 样式', () => {
  assert.match(source, /className="ui-badge"/);
  assert.match(source, /\{items.length\} 条变化/);
});
