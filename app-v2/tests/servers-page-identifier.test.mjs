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

test('MCP 详情抽屉展示配置说明区块', () => {
  assert.match(source, /配置说明/);
});

test('MCP 详情抽屉保留原始配置折叠区', () => {
  assert.match(source, /原始配置/);
});

test('MCP 详情抽屉中的编辑按钮文案使用编辑', () => {
  assert.doesNotMatch(source, /编辑说明/);
  assert.match(source, /编辑/);
});
