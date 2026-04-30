import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skillsPageSource = readFileSync(new URL("../src/pages/SkillsPage.tsx", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../src/lib/types.ts", import.meta.url), "utf8");
const formatSource = readFileSync(new URL("../src/lib/format.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Skill 类型定义支持共享 agent 来源与只读标记", () => {
  assert.match(typesSource, /export type SkillSource = .*"agent_shared"/);
  assert.match(typesSource, /readonly: boolean/);
});

test("SkillsPage 提供 Agent 来源筛选", () => {
  assert.match(skillsPageSource, /label: "Agent"/);
  assert.match(skillsPageSource, /sourceOptions/);
  assert.match(skillsPageSource, /source === "agent_shared"/);
});

test("共享 agent skill 在页面中以只读方式禁用变更操作", () => {
  assert.match(skillsPageSource, /readonly/);
  assert.match(skillsPageSource, /共享 Skill 第一阶段为只读/);
  assert.match(skillsPageSource, /disabled=\{busy \|\| s\.readonly/);
});

test("格式化模块提供共享来源标签", () => {
  assert.match(formatSource, /skillSourceLabel/);
  assert.match(formatSource, /agent_shared/);
  assert.match(formatSource, /"Agent"/);
});

test("首页已安装统计排除只读共享 skill", () => {
  assert.match(appSource, /s\.scope === "user" && !s\.readonly/);
});
