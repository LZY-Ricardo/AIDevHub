import type { BackupOp, Client, SkillKind, SkillScope, Transport } from "./types";

export function clientLabel(c: Client): string {
  return c === "claude_code" ? "Claude Code" : "Codex";
}

export function transportLabel(t: Transport): string {
  if (t === "stdio") return "stdio";
  if (t === "http") return "http";
  return "未知";
}

export function opLabel(op: BackupOp): string {
  switch (op) {
    case "toggle":
      return "开关切换";
    case "add_server":
      return "新增MCP";
    case "apply_profile":
      return "应用方案";
    case "rollback":
      return "回滚恢复";
  }
}

export function enabledLabel(enabled: boolean): string {
  return enabled ? "已启用" : "已停用";
}

export function skillScopeLabel(scope: SkillScope): string {
  return scope === "system" ? "系统" : "用户";
}

export function skillKindLabel(kind: SkillKind): string {
  return kind === "dir" ? "目录" : "文件";
}

export function existsLabel(exists: boolean): string {
  return exists ? "是" : "否";
}

export function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
