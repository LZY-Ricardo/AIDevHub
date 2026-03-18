import type { BackupOp, Client, Transport } from "./types";

export function clientLabel(c: Client): string {
  return c === "claude_code" ? "Claude Code" : "Codex";
}

export function transportLabel(t: Transport): string {
  if (t === "stdio") return "stdio";
  if (t === "http") return "http";
  return "unknown";
}

export function opLabel(op: BackupOp): string {
  switch (op) {
    case "toggle":
      return "Toggle";
    case "add_server":
      return "Add Server";
    case "apply_profile":
      return "Apply Profile";
    case "rollback":
      return "Rollback";
  }
}

export function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

