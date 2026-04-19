import test from "node:test";
import assert from "node:assert/strict";
import { deriveSettingsSaveState } from "../src/lib/settingsSaveState.ts";

const baseSettings = { mcp_diff_check_mode: "open_diff" };

test("设置未加载时显示未加载状态", () => {
  const state = deriveSettingsSaveState({
    settings: null,
    currentMode: "open_diff",
    busy: false,
    error: null,
  });

  assert.equal(state.label, "未加载");
});

test("有未保存更改时不误报已同步", () => {
  const state = deriveSettingsSaveState({
    settings: baseSettings,
    currentMode: "summary_only",
    busy: false,
    error: null,
  });

  assert.equal(state.label, "未保存更改");
});

test("保存中优先于其他状态", () => {
  const state = deriveSettingsSaveState({
    settings: baseSettings,
    currentMode: "summary_only",
    busy: true,
    error: null,
  });

  assert.equal(state.label, "保存中");
});

test("保存失败优先于未保存更改", () => {
  const state = deriveSettingsSaveState({
    settings: baseSettings,
    currentMode: "summary_only",
    busy: false,
    error: { code: "WRITE_FAILED", message: "boom" },
  });

  assert.equal(state.label, "保存失败");
});
