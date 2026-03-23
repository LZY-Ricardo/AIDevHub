import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/ServersPage.tsx', import.meta.url), 'utf8');

test('MCP 列表页不再展示标识列', () => {
  assert.doesNotMatch(source, /<th[^>]*>\s*标识\s*<\/th>/);
});

test('MCP 详情抽屉不再展示标识字段', () => {
  assert.doesNotMatch(source, /shown!\.identity/);
});

test('MCP 详情抽屉展示功能作用区块', () => {
  assert.match(source, /功能作用/);
});

test('MCP 详情抽屉提供查看配置说明入口', () => {
  assert.match(source, /展开配置说明/);
});

test('MCP 详情抽屉在展开后保留查看原始配置入口', () => {
  assert.match(source, /切换到原始配置/);
});

test('MCP 详情抽屉默认隐藏配置说明面板', () => {
  assert.match(source, /const \[configPanelOpen, setConfigPanelOpen\] = useState\(false\)/);
});

test('MCP 详情抽屉使用独立配置视图模式控制摘要和原始配置', () => {
  assert.match(source, /const \[configViewMode, setConfigViewMode\] = useState<"summary" \| "raw">\("summary"\)/);
});

test('MCP 详情抽屉中的摘要和原始配置互斥展示', () => {
  assert.match(source, /configPanelOpen && configViewMode === "summary"/);
  assert.match(source, /configPanelOpen && configViewMode === "raw"/);
});

test('MCP 详情抽屉使用统一的紧凑卡片内边距', () => {
  assert.match(source, /const DETAIL_CARD_PADDING = "12px"/);
});

test('MCP 详情抽屉不再保留独立的来源文件卡片', () => {
  assert.doesNotMatch(source, /<div className="ui-label">来源文件<\/div>\s*[\r\n]+\s*<div className="ui-code"/);
  assert.match(source, /来源文件：/);
});

test('MCP 详情抽屉移除配置区默认说明文案', () => {
  assert.doesNotMatch(source, /为了保持一屏可读，配置说明默认不展示/);
  assert.doesNotMatch(source, /说明支持人工编辑，详情页默认收起配置区/);
});

test('MCP 详情抽屉中的按钮文案明确指向具体内容', () => {
  assert.match(source, /编辑配置/);
  assert.match(source, /编辑功能说明/);
  assert.match(source, /显示敏感信息/);
  assert.match(source, /收起配置说明/);
  assert.match(source, /切换到配置摘要/);
  assert.match(source, /展开其余 \$\{remainingFields\.length\} 项/);
  assert.doesNotMatch(source, />\s*编辑\s*</);
});

test('MCP 详情抽屉顶部操作区使用单行紧凑工具栏', () => {
  assert.match(source, /const DETAIL_HEADER_LAYOUT_STYLE = \{/);
  assert.match(source, /const DETAIL_ACTION_ROW_STYLE = \{/);
  assert.match(source, /const DETAIL_ACTION_BUTTON_STYLE = \{/);
  assert.match(source, /gridTemplateColumns: "minmax\(0, 1fr\) auto"/);
  assert.match(source, /whiteSpace: "nowrap"/);
});
