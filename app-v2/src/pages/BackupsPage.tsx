import { useEffect, useMemo, useState } from "react";
import type { AppError, BackupRecord, FilePrecondition, RuntimeInfo, WritePreview } from "../lib/types";
import { api } from "../lib/api";
import { isoToLocal, opLabel } from "../lib/format";
import { Icon } from "../components/Icon";
import { UiSelect, type UiSelectOption } from "../components/UiSelect";
import { WritePreviewDialog } from "../components/WritePreviewDialog";
import { sortBackupRecordsDesc } from "../lib/backupTimeline";

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

  const targetOptions = useMemo(() => {
    return [
      { value: "", label: "全部" },
      ...targetChoices.map((p) => ({ value: p, label: p })),
    ] satisfies Array<UiSelectOption<string>>;
  }, [targetChoices]);

  const sortedRecords = useMemo(() => {
    return records ? sortBackupRecordsDesc(records) : [];
  }, [records]);

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
    setPreviewTitle(`回滚预览：${b.backup_id}`);
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
      <section className="ui-pageSummary">
        <div className="ui-pageSummaryGrid">
          <div className="ui-pageSummaryCard">
            <div className="ui-label">恢复中心</div>
            <div className="ui-pageSummaryValue">
              {records?.length ?? 0}
            </div>
            <div className="ui-help">当前可用备份记录</div>
          </div>
          <div className="ui-pageSummaryCard">
            <div className="ui-label">最近快照</div>
            <div className="ui-pageSummaryValue">
              {sortedRecords[0] ? isoToLocal(sortedRecords[0].created_at) : "暂无"}
            </div>
            <div className="ui-help">优先展示最近一次可恢复快照</div>
          </div>
          <div className="ui-pageSummaryCard">
            <div className="ui-label">回滚提示</div>
            <div className="ui-pageSummaryValue">
              {pendingRollback ? "待确认" : "预览优先"}
            </div>
            <div className="ui-help">任何恢复动作都必须先经过预览</div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="ui-error">
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{error.code}</div>
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{error.message}</div>
        </div>
      ) : null}

      <div className="ui-card ui-pageFilterCard" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div className="ui-label">按目标文件筛选</div>
            <div style={{ minWidth: 260, maxWidth: 520 }}>
              <UiSelect<string>
                ariaLabel="按目标文件筛选"
                value={targetPath}
                options={targetOptions}
                onChange={setTargetPath}
              />
            </div>
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

      <div className="ui-workspaceLayout">
        <section className="ui-workspaceMain">
          <div className="ui-cardTitleRow">
            <h2 className="ui-sectionTitle">恢复时间线</h2>
          </div>
          <div className="ui-timeline">
            {sortedRecords.slice(0, 2).map((record) => (
              <article key={record.backup_id} className="ui-timelineItem">
                <div className="ui-timelineTitle">
                  {isoToLocal(record.created_at)} · {opLabel(record.op)}
                </div>
                <div className="ui-help">{record.target_path}</div>
              </article>
            ))}
          </div>

          <div className="ui-tableWrap">
        <table className="ui-table ui-tableBackups ui-tableNoStickyLastCol" aria-label="备份列表">
          <colgroup>
            <col className="ui-colBackupCreatedAt" />
            <col className="ui-colBackupOp" />
            <col className="ui-colBackupTarget" />
            <col className="ui-colBackupSummary" />
            <col className="ui-colBackupAction" />
          </colgroup>
          <thead>
            <tr>
              <th className="ui-th">创建时间</th>
              <th className="ui-th">操作类型</th>
              <th className="ui-th">目标文件</th>
              <th className="ui-th">摘要</th>
              <th className="ui-th ui-tableColAction">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((b) => (
              <tr key={b.backup_id} className="ui-tr">
                <td className="ui-td ui-code">{isoToLocal(b.created_at)}</td>
                <td className="ui-td">
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{opLabel(b.op)}</span>
                  </span>
                </td>
                <td className="ui-td">
                  <div className="ui-code ui-ellipsis ui-backupTargetText" title={b.target_path}>
                    {b.target_path}
                  </div>
                </td>
                <td className="ui-td">
                  <div className="ui-ellipsis ui-backupSummaryText" title={b.summary}>
                    {b.summary}
                  </div>
                </td>
                <td className="ui-td ui-tableColAction">
                  <div className="ui-btnRow ui-tableActionRow">
                    <button
                      type="button"
                      className="ui-btn ui-btnPrimary"
                      onClick={() => previewRollback(b)}
                      disabled={busy}
                    >
                      预览回滚
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
        </section>

        <aside className="ui-workspaceSide">
          <div className="ui-sidePanelCard">
            <h3 className="ui-sidePanelTitle">回滚提示</h3>
            <p className="ui-sidePanelText">
              回滚会恢复目标文件内容，并自动生成新的备份记录。高风险操作应始终从预览开始。
            </p>
          </div>
        </aside>
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
