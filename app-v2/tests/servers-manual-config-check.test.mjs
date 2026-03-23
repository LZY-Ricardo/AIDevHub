import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/ServersPage.tsx', import.meta.url), 'utf8');

test('ServersPage 提供手动检查更新按钮', () => {
  assert.match(source, /手动检查更新/);
});

test('ServersPage 通过 props 复用 App 的统一检查入口', () => {
  assert.match(source, /onCheckConfigUpdates\s*:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(source, /configCheckBusy:\s*boolean/);
  assert.match(source, /onClick=\{onCheckConfigUpdates\}/);
  assert.match(source, /disabled=\{busy\s*\|\|\s*configCheckBusy\}/);
});

test('MCP 详情文案将来源文件替换为当前来源', () => {
  assert.match(source, /当前来源/);
  assert.doesNotMatch(source, /来源文件/);
});
