import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveCheckResultState,
  deriveIgnorePreflightState,
  shouldRefreshAfterIgnore,
} from "../src/lib/config-check-state.js";

test("检查结果到达后正确决定 updates/dialogOpen/error", () => {
  const state = deriveCheckResultState([{ source_id: "a" }, { source_id: "b" }], null);
  assert.equal(state.dialogOpen, true);
  assert.equal(state.error, null);
  assert.deepEqual(state.updates, [{ source_id: "a" }, { source_id: "b" }]);
});

test("检查结果为空时会关闭对话框并清空错误", () => {
  const state = deriveCheckResultState([], { code: "INTERNAL_ERROR", message: "x" });
  assert.equal(state.dialogOpen, false);
  assert.equal(state.error, null);
  assert.deepEqual(state.updates, []);
});

test("ignore 失败前会失效旧 diff 且失败后必须刷新", () => {
  const pre = deriveIgnorePreflightState();
  assert.deepEqual(pre, { updates: [], dialogOpen: false });
  assert.equal(shouldRefreshAfterIgnore(new Error("stale")), true);
});
