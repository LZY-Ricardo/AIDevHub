import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/ServersPage.tsx', import.meta.url), 'utf8');

test('MCP 详情抽屉提供编辑按钮', () => {
  assert.match(source, /编辑/);
});

test('MCP 编辑态接入编辑会话 API', () => {
  assert.match(source, /serverGetEditSession/);
});

test('MCP 编辑态接入编辑预览 API', () => {
  assert.match(source, /serverPreviewEdit/);
});

test('MCP 编辑态展示基础编辑标签', () => {
  assert.match(source, /基础编辑/);
});

test('MCP 编辑态展示高级编辑标签', () => {
  assert.match(source, /高级编辑/);
});

test('MCP 编辑态接入编辑应用 API', () => {
  assert.match(source, /serverApplyEdit/);
});
