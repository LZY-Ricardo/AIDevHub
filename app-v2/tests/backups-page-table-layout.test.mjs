import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/pages/BackupsPage.tsx", import.meta.url), "utf8");

test("备份回滚表格禁用最后一列 sticky 效果", () => {
  assert.match(source, /ui-tableNoStickyLastCol/);
});

test("备份回滚操作列复用统一表格操作样式", () => {
  assert.match(source, /ui-tableColAction/);
  assert.match(source, /ui-tableActionRow/);
});
