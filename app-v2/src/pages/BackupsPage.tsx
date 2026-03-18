import { useEffect, useMemo, useState } from "react";
import type { AppError, BackupRecord, FilePrecondition, RuntimeInfo, WritePreview } from "../lib/types";
import { api } from "../lib/api";
import { isoToLocal, opLabel } from "../lib/format";
import { Icon } from "../components/Icon";
import { WritePreviewDialog } from "../components/WritePreviewDialog";

export function BackupsPage() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [targetPath, setTargetPath] = useState<string>("");
  const [records, setRecords] = useState<BackupRecord[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  const [preview, setPreview] = useState<WritePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingRollback, setPendingRollback] = useState<{ backup_id: string } | null>(null);
  const [previewTitle, setPreviewTitle] = useState("回滚预览");

  const targetChoices = useMemo(() => {
    if (!runtime) return [];
    return [
      runtime.paths.claude_config_path,
      runtime.paths.codex_config_path,
      runtime.paths.profiles_path,
      runtime.paths.disabled_pool_path,
      runtime.paths.backup_index_path,
    ];
  }, [runtime]);

  async function load() {
    setError(null);
    try {
      const r = await api.runtimeGetInfo();
      setRuntime(r);
      const list = await api.backupList(targetPath ? { target_path: targetPath } : {});
      setRecords(list);
    } catch (e) {
      setError(e as AppError);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!runtime) return;
    // keep list responsive when filtering
    (async () => {
      try {
        const list = await api.backupList(targetPath ? { target_path: targetPath } : {});
        setRecords(list);
      } catch (e) {
        setError(e as AppError);
      }
    })();
  }, [targetPath, runtime]);

  async function previewRollback(b: BackupRecord) {
    setError(null);
    setBusy(true);
    setPreview(null);
    setPendingRollback({ backup_id: b.backup_id });
    setPreviewTitle(`Rollback: ${b.backup_id}`);
    try {
      const p = await api.backupPreviewRollback({ backup_id: b.backup_id });
      setPreview(p);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function applyRollback(expected_files: FilePrecondition[]) {
    if (!pendingRollback) return;
    setError(null);
    setBusy(true);
    try {
      await api.backupApplyRollback({ ...pendingRollback, expected_files });
      setPreviewOpen(false);
      setPendingRollback(null);
      await load();
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {error ? (
        <div className="ui-error">
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{error.code}</div>
          <div style={{ marginTop: "8px", color: "rgba(248, 250, 252, 0.86)" }}>{error.message}</div>
        </div>
      ) : null}

      <div className="ui-card" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div className="ui-label">Filter by target</div>
            <select className="ui-select" value={targetPath} onChange={(e) => setTargetPath(e.currentTarget.value)}>
              <option value="">All</option>
              {targetChoices.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="ui-btnRow">
            <button type="button" className="ui-btn" onClick={load} disabled={busy}>
              <Icon name="refresh" /> 刷新
            </button>
          </div>
        </div>
        <div style={{ marginTop: "10px" }} className="ui-help">
          回滚 apply 会先对当前目标文件再备份一次，然后恢复选中的备份内容。
        </div>
      </div>

      <div className="ui-tableWrap">
        <table className="ui-table" aria-label="备份列表">
          <thead>
            <tr>
              <th className="ui-th">Created</th>
              <th className="ui-th">Op</th>
              <th className="ui-th">Target</th>
              <th className="ui-th">Summary</th>
              <th className="ui-th" style={{ width: 160 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {(records ?? []).map((b) => (
              <tr key={b.backup_id} className="ui-tr">
                <td className="ui-td ui-code">{isoToLocal(b.created_at)}</td>
                <td className="ui-td">
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{opLabel(b.op)}</span>
                  </span>
                </td>
                <td
                  className="ui-td ui-code"
                  style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {b.target_path}
                </td>
                <td className="ui-td" style={{ color: "rgba(248, 250, 252, 0.86)" }}>
                  {b.summary}
                </td>
                <td className="ui-td">
                  <div className="ui-btnRow">
                    <button
                      type="button"
                      className="ui-btn ui-btnPrimary"
                      onClick={() => previewRollback(b)}
                      disabled={busy}
                    >
                      Preview
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {records && records.length === 0 ? (
              <tr>
                <td className="ui-td" colSpan={5}>
                  <div className="ui-help">暂无备份记录。</div>
                </td>
              </tr>
            ) : null}
            {!records ? (
              <tr>
                <td className="ui-td" colSpan={5}>
                  <div className="ui-help">加载中...</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <WritePreviewDialog
        title={previewTitle}
        preview={preview}
        open={previewOpen}
        busy={busy}
        onClose={() => {
          if (busy) return;
          setPreviewOpen(false);
        }}
        onConfirm={applyRollback}
      />
    </div>
  );
}
