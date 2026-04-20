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

test("本地已安装的 skill 应反映为已安装，即使无 deployment 记录", () => {
  const state = summarizeRepoSkillInstallState(
    [],
    [
      { skill_id: "claude_code:beads-assistant", client: "claude_code" },
      { skill_id: "claude_code:cn-commit", client: "claude_code" },
    ],
    [
      { skill_id: "skill-abc123", slug: "beads-assistant", display_name: "Beads" },
      { skill_id: "skill-def456", slug: "cn-commit", display_name: "CN Commit" },
    ],
  );

  const beads = state.get("skill-abc123");
  assert.equal(beads?.claudeInstalled, true);
  assert.equal(repoSkillInstallStatusText(beads), "已安装到 Claude");

  const cnCommit = state.get("skill-def456");
  assert.equal(cnCommit?.claudeInstalled, true);
  assert.equal(repoSkillInstallStatusText(cnCommit), "已安装到 Claude");
});

test("本地 skill 与 deployment 合并时应正确叠加", () => {
  const state = summarizeRepoSkillInstallState(
    [deployment({ skill_id: "skill-xyz", client: "codex", target_type: "codex_global" })],
    [{ skill_id: "claude_code:my-skill", client: "claude_code" }],
    [{ skill_id: "skill-xyz", slug: "my-skill", display_name: "My Skill" }],
  ).get("skill-xyz");

  assert.equal(state?.claudeInstalled, true);
  assert.equal(state?.codexInstalled, true);
  assert.equal(repoSkillInstallStatusText(state), "已安装到 Claude / Codex");
});
