import test from "node:test";
import assert from "node:assert/strict";

import {
  canInstallRepoSkillToTargetType,
  canInstallRepoSkillToClient,
  repoSkillInstallStatusText,
  summarizeRepoSkillInstallState,
} from "../src/lib/repoSkillInstallState.ts";

function deployment(overrides = {}) {
  return {
    deployment_id: "dep-1",
    skill_id: "skill-1",
    target_type: "codex_global",
    client: "codex",
    target_root: "F:/Users/demo/.codex/skills",
    target_skill_path: "F:/Users/demo/.codex/skills/skill-1",
    deployed_name: "skill-1",
    status: "deployed",
    source_hash: "sha256:test",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
    ...overrides,
  };
}

test("missing deployment 不应被聚合为已安装", () => {
  const state = summarizeRepoSkillInstallState([
    deployment({ status: "missing" }),
  ]).get("skill-1");

  assert.equal(state?.codexInstalled, false);
  assert.equal(state?.codexMissing, true);
  assert.equal(repoSkillInstallStatusText(state), "Codex 安装缺失");
  assert.equal(canInstallRepoSkillToClient(state, "codex"), true);
});

test("deployed 和 outdated 仍视为已安装", () => {
  const state = summarizeRepoSkillInstallState([
    deployment({ client: "claude_code", target_type: "claude_global" }),
    deployment({ deployment_id: "dep-2", status: "outdated" }),
  ]).get("skill-1");

  assert.equal(state?.claudeInstalled, true);
  assert.equal(state?.codexInstalled, true);
  assert.equal(repoSkillInstallStatusText(state), "已安装到 Claude / Codex");
  assert.equal(canInstallRepoSkillToClient(state, "claude_code"), false);
  assert.equal(canInstallRepoSkillToClient(state, "codex"), false);
});

test("disabled deployment 不应影响安装状态", () => {
  const state = summarizeRepoSkillInstallState([
    deployment({ status: "disabled" }),
  ]).get("skill-1");

  assert.equal(state?.codexInstalled, false);
  assert.equal(state?.codexMissing, false);
  assert.equal(repoSkillInstallStatusText(state), "未安装");
});

test("项目投放不应阻止全局安装", () => {
  const state = summarizeRepoSkillInstallState([
    deployment({
      client: "claude_code",
      target_type: "claude_project",
      project_root: "F:/myProjects/demo",
    }),
    deployment({
      deployment_id: "dep-2",
      target_type: "codex_project",
      project_root: "F:/myProjects/demo",
    }),
  ]).get("skill-1");

  assert.equal(state?.claudeInstalled, false);
  assert.equal(state?.codexInstalled, false);
  assert.equal(repoSkillInstallStatusText(state), "未安装");
  assert.equal(canInstallRepoSkillToClient(state, "claude_code"), true);
  assert.equal(canInstallRepoSkillToClient(state, "codex"), true);
  assert.equal(canInstallRepoSkillToTargetType(state, "claude_global"), true);
  assert.equal(canInstallRepoSkillToTargetType(state, "codex_global"), true);
  assert.equal(canInstallRepoSkillToTargetType(state, "claude_project"), true);
  assert.equal(canInstallRepoSkillToTargetType(state, "codex_project"), true);
});

test("全局安装应只禁用对应全局目标，不影响项目目标", () => {
  const state = summarizeRepoSkillInstallState([
    deployment({ client: "claude_code", target_type: "claude_global" }),
    deployment({
      deployment_id: "dep-2",
      target_type: "codex_global",
    }),
  ]).get("skill-1");

  assert.equal(canInstallRepoSkillToTargetType(state, "claude_global"), false);
  assert.equal(canInstallRepoSkillToTargetType(state, "codex_global"), false);
  assert.equal(canInstallRepoSkillToTargetType(state, "claude_project"), true);
  assert.equal(canInstallRepoSkillToTargetType(state, "codex_project"), true);
});
