import test from "node:test";
import assert from "node:assert/strict";

import { getProjectRootDraftError, isAbsoluteProjectRoot } from "../src/lib/projectRootValidation.ts";

test("isAbsoluteProjectRoot: 识别 Windows 盘符路径", () => {
  assert.equal(isAbsoluteProjectRoot("F:/myProjects/demo"), true);
  assert.equal(isAbsoluteProjectRoot("C:\\repo\\demo"), true);
});

test("isAbsoluteProjectRoot: 识别 UNC 与 POSIX 路径", () => {
  assert.equal(isAbsoluteProjectRoot("\\\\server\\share\\demo"), true);
  assert.equal(isAbsoluteProjectRoot("/Users/demo/project"), true);
});

test("getProjectRootDraftError: 空值提示输入目录", () => {
  assert.equal(getProjectRootDraftError(""), "请输入项目目录");
  assert.equal(getProjectRootDraftError("   "), "请输入项目目录");
});

test("getProjectRootDraftError: 相对路径提示绝对路径", () => {
  assert.equal(getProjectRootDraftError("demo/project"), "请输入绝对路径，例如 F:/myProjects/demo");
});

test("getProjectRootDraftError: 绝对路径不报错", () => {
  assert.equal(getProjectRootDraftError("F:/myProjects/demo"), null);
});
