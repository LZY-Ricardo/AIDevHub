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
    case "edit_server":
      return "编辑MCP";
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

export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
