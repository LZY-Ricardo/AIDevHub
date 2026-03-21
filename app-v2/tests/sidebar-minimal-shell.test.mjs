import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shellSource = readFileSync(new URL('../src/components/AppShell.tsx', import.meta.url), 'utf8');


test('侧边栏不再渲染顶部品牌区', () => {
  assert.doesNotMatch(shellSource, /ui-brand/);
  assert.doesNotMatch(shellSource, /AIDevHub/);
  assert.doesNotMatch(shellSource, /MCP 配置中控台 \(MVP\)/);
});

test('侧边栏不再渲染底部写入说明', () => {
  assert.doesNotMatch(shellSource, /所有写入都会先生成差异预览，再写入并自动备份。/);
  assert.doesNotMatch(shellSource, /ui-help/);
});
