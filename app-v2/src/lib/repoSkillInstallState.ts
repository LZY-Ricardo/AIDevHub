import type { Client, DeploymentTargetType, ManagedSkillView, SkillDeployment, SkillRecord } from "./types";

export interface RepoSkillInstallState {
  claudeInstalled: boolean;
  codexInstalled: boolean;
  claudeMissing: boolean;
  codexMissing: boolean;
}

const ACTIVE_STATUSES = new Set<SkillDeployment["status"]>(["deployed", "drifted", "outdated"]);

function matchesGlobalTargetType(deployment: SkillDeployment, client: Client): boolean {
  return client === "claude_code"
    ? deployment.target_type === "claude_global"
    : deployment.target_type === "codex_global";
}

/** Extract the short skill name from a SkillRecord.skill_id like "claude_code:beads-assistant" */
function stripClientPrefix(skillId: string): string {
  const idx = skillId.indexOf(":");
  return idx >= 0 ? skillId.slice(idx + 1) : skillId;
}

/**
 * Build a mapping from slug → repo skill_id (hashed).
 * e.g. "beads-assistant" → "skill-a1b2c3d4e5f6a7b8"
 */
function buildSlugToIdMap(repoSkills: ManagedSkillView[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const rs of repoSkills) {
    map.set(rs.slug, rs.skill_id);
  }
  return map;
}

export function summarizeRepoSkillInstallState(
  deployments: SkillDeployment[],
  localSkills?: SkillRecord[],
  repoSkills?: ManagedSkillView[],
): Map<string, RepoSkillInstallState> {
  const state = new Map<string, RepoSkillInstallState>();

  for (const deployment of deployments) {
    const current = state.get(deployment.skill_id) ?? {
      claudeInstalled: false,
      codexInstalled: false,
      claudeMissing: false,
      codexMissing: false,
    };

    if (deployment.client === "claude_code" && matchesGlobalTargetType(deployment, "claude_code")) {
      current.claudeInstalled = current.claudeInstalled || ACTIVE_STATUSES.has(deployment.status);
      current.claudeMissing = current.claudeMissing || deployment.status === "missing";
    }

    if (deployment.client === "codex" && matchesGlobalTargetType(deployment, "codex")) {
      current.codexInstalled = current.codexInstalled || ACTIVE_STATUSES.has(deployment.status);
      current.codexMissing = current.codexMissing || deployment.status === "missing";
    }

    state.set(deployment.skill_id, current);
  }

  // Cross-reference with locally installed skills to detect manual installs
  // that have no deployment record.  Repo skill_ids are hashed ("skill-abc…"),
  // so we resolve via the slug field (e.g. "beads-assistant").
  if (localSkills && localSkills.length > 0 && repoSkills && repoSkills.length > 0) {
    const slugToId = buildSlugToIdMap(repoSkills);

    for (const skill of localSkills) {
      const slug = stripClientPrefix(skill.skill_id);
      const repoId = slugToId.get(slug);
      if (!repoId) continue;

      const current = state.get(repoId) ?? {
        claudeInstalled: false,
        codexInstalled: false,
        claudeMissing: false,
        codexMissing: false,
      };

      if (skill.client === "claude_code") {
        current.claudeInstalled = true;
      } else if (skill.client === "codex") {
        current.codexInstalled = true;
      }

      state.set(repoId, current);
    }
  }

  return state;
}

export function repoSkillInstallStatusText(state: RepoSkillInstallState): string {
  if (state.claudeInstalled && state.codexInstalled) return "已安装到 Claude / Codex";
  if (state.claudeInstalled) return "已安装到 Claude";
  if (state.codexInstalled) return "已安装到 Codex";
  if (state.claudeMissing && state.codexMissing) return "Claude / Codex 安装缺失";
  if (state.claudeMissing) return "Claude 安装缺失";
  if (state.codexMissing) return "Codex 安装缺失";
  return "未安装";
}

export function canInstallRepoSkillToClient(
  state: RepoSkillInstallState,
  client: Client,
): boolean {
  return client === "claude_code" ? !state.claudeInstalled : !state.codexInstalled;
}

export function canInstallRepoSkillToTargetType(
  state: RepoSkillInstallState,
  targetType: DeploymentTargetType,
): boolean {
  if (targetType === "claude_global") return !state.claudeInstalled;
  if (targetType === "codex_global") return !state.codexInstalled;
  return true;
}
