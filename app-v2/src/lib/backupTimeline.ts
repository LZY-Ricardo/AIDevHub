import type { BackupRecord } from "./types";

export function sortBackupRecordsDesc(records: BackupRecord[]): BackupRecord[] {
  return [...records].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
