import type { Client, DeploymentTargetType, SkillDeployment } from "./types";

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

export function summarizeRepoSkillInstallState(
  deployments: SkillDeployment[],
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
