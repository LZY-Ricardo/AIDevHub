import test from "node:test";
import assert from "node:assert/strict";
import { sortBackupRecordsDesc } from "../src/lib/backupTimeline.ts";

test("备份记录按 created_at 倒序排序", () => {
  const sorted = sortBackupRecordsDesc([
    {
      backup_id: "b-1",
      target_path: "a",
      backup_path: "a.bak",
      created_at: "2026-04-18T10:00:00Z",
      op: "toggle",
      summary: "old",
    },
    {
      backup_id: "b-2",
      target_path: "a",
      backup_path: "a.bak2",
      created_at: "2026-04-18T12:00:00Z",
      op: "rollback",
      summary: "new",
    },
  ]);

  assert.equal(sorted[0].backup_id, "b-2");
  assert.equal(sorted[1].backup_id, "b-1");
});
