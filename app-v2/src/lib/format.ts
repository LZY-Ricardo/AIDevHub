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

/** 将 T 后时间部分的短横线还原为冒号，以兼容 2026-04-01T02-39-55Z 这类格式 */
export function normalizeIso(iso: string): string {
  return iso.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
}

export function isoToLocal(iso: string): string {
  const d = new Date(normalizeIso(iso));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(normalizeIso(iso));
  if (Number.isNaN(d.getTime())) return iso;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  if (year === new Date().getFullYear()) {
    return `${month}-${day} ${hour}:${min}:${sec}`;
  }
  return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
}
