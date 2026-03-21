import { useEffect, useState } from "react";
import type { AppError, Client, FilePrecondition, ServerNotes, ServerRecord, WritePreview } from "../lib/types";
import { api } from "../lib/api";
import { clientLabel, enabledLabel, transportLabel } from "../lib/format";
import { Icon } from "../components/Icon";
import { UiSelect, type UiSelectOption } from "../components/UiSelect";
import { WritePreviewDialog } from "../components/WritePreviewDialog";
import { explainServerDetails } from "../lib/serverExplain";

// 去掉 MCP ID 前缀，只显示名称
function formatMcpName(serverId: string): string {
  // 处理 "claude_code:xxx" 或 "codex:xxx" 格式
  if (serverId.includes(":")) {
    return serverId.split(":").slice(1).join(":");
  }
  // 处理其他前缀格式
  return serverId.replace(/^(mcp__|claudecode__|codex__|claude_code__)/, "");
}

const EMPTY_SERVER_NOTES: ServerNotes = {
  description: "",
  field_hints: {},
};

export function ServersPage() {
  const [client, setClient] = useState<Client>("claude_code");
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<ServerRecord | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<ServerRecord | null>(null);

  const [preview, setPreview] = useState<WritePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("变更预览");
  const [pendingToggle, setPendingToggle] = useState<{ server_id: string; enabled: boolean } | null>(
    null,
  );

  const clientOptions = [
    { value: "claude_code", label: clientLabel("claude_code") },
    { value: "codex", label: clientLabel("codex") },
  ] satisfies Array<UiSelectOption<Client>>;

  async function load() {
    setError(null);
    try {
      const list = await api.serverList({ client });
      setServers(list);
    } catch (e) {
      setError(e as AppError);
    }
  }

  useEffect(() => {
    load();
  }, [client]);

  async function openDetails(s: ServerRecord) {
    setSelected(s);
    setSelectedDetails(null);
    setDetailsOpen(true);
    try {
      const full = await api.serverGet({ server_id: s.server_id, reveal_secrets: false });
      setSelectedDetails(full);
    } catch {
      // Details are best-effort; keep drawer with basic info
    }
  }

  async function requestToggle(s: ServerRecord, enabled: boolean) {
    setBusy(true);
    setPreview(null);
    setPendingToggle({ server_id: s.server_id, enabled });
    setPreviewTitle(`切换MCP：${s.server_id} → ${enabled ? "启用" : "停用"}`);
    try {
      const p = await api.serverPreviewToggle({ server_id: s.server_id, enabled });
      setPreview(p);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function applyToggle(expected_files: FilePrecondition[]) {
    if (!pendingToggle) return;
    setBusy(true);
    try {
      await api.serverApplyToggle({ ...pendingToggle, expected_files });
      setPreviewOpen(false);
      setPendingToggle(null);
      await load();
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div className="ui-card" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div className="ui-label">客户端</div>
            <div style={{ minWidth: 180 }}>
              <UiSelect<Client>
                ariaLabel="选择客户端"
                value={client}
                options={clientOptions}
                onChange={setClient}
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
          点击行可查看详情。开关操作会先生成差异预览，确认后才会写入并备份。
        </div>
      </div>

      {error ? (
        <div className="ui-error">
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{error.code}</div>
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{error.message}</div>
        </div>
      ) : null}

      <div className="ui-tableWrap">
        <table className="ui-table ui-tableMcp ui-tableNoStickyLastCol" aria-label="MCP列表">
          <colgroup>
            <col className="ui-colName" />
            <col className="ui-colTransport" />
            <col className="ui-colStatus" />
            <col className="ui-colAction" />
          </colgroup>
          <thead>
            <tr>
              <th className="ui-th">名称</th>
              <th className="ui-th">传输方式</th>
              <th className="ui-th">启用状态</th>
              <th className="ui-th ui-tableColAction">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {(servers ?? []).map((s) => {
              const displayName = formatMcpName(s.server_id);
              const transportText = transportLabel(s.transport);
              const statusText = enabledLabel(s.enabled);

              return (
                <tr
                  key={s.server_id}
                  className="ui-tr"
                  onClick={() => openDetails(s)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="ui-td">
                    <div className="ui-code ui-ellipsis ui-serverNameText" title={displayName}>
                      {displayName}
                    </div>
                  </td>
                  <td className="ui-td">
                    <span className="ui-pill ui-serverMetaPill" title={transportText}>
                      <span className="ui-pillDot" />
                      <span className="ui-code ui-ellipsis ui-pillText">{transportText}</span>
                    </span>
                  </td>
                  <td className="ui-td">
                    <span className="ui-pill ui-serverMetaPill" title={statusText}>
                      <span className={`ui-pillDot ${s.enabled ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
                      <span className="ui-code ui-ellipsis ui-pillText">{statusText}</span>
                    </span>
                  </td>
                  <td className="ui-td ui-tableColAction" onClick={(e) => e.stopPropagation()}>
                    <div className="ui-btnRow ui-tableActionRow">
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={busy}
                        onClick={() => requestToggle(s, !s.enabled)}
                        title="切换启用状态"
                      >
                        {s.enabled ? "停用" : "启用"}
                      </button>
                      <button type="button" className="ui-btn" onClick={() => openDetails(s)}>
                        详情 <Icon name="chevronRight" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {servers && servers.length === 0 ? (
              <tr>
                <td className="ui-td" colSpan={4}>
                  <div className="ui-help">暂无 MCP。</div>
                </td>
              </tr>
            ) : null}
            {!servers ? (
              <tr>
                <td className="ui-td" colSpan={4}>
                  <div className="ui-help">加载中...</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <DetailsDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        basic={selected}
        full={selectedDetails}
      />

      <WritePreviewDialog
        title={previewTitle}
        preview={preview}
        open={previewOpen}
        busy={busy}
        onClose={() => {
          if (busy) return;
          setPreviewOpen(false);
        }}
        onConfirm={applyToggle}
      />
    </div>
  );
}

function DetailsDrawer({
  open,
  onClose,
  basic,
  full,
}: {
  open: boolean;
  onClose: () => void;
  basic: ServerRecord | null;
  full: ServerRecord | null;
}) {
  const s = full ?? basic;
  const canReveal = Boolean(s);
  const [reveal, setReveal] = useState(false);
  const [revealBusy, setRevealBusy] = useState(false);
  const [revealed, setRevealed] = useState<ServerRecord | null>(null);
  const [notes, setNotes] = useState<ServerNotes>(EMPTY_SERVER_NOTES);
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");

  useEffect(() => {
    setReveal(false);
    setRevealed(null);
    setRevealBusy(false);
    setNotes(EMPTY_SERVER_NOTES);
    setNotesBusy(false);
    setNotesError(null);
    setEditingDescription(false);
    setDescriptionDraft("");
    setEditingFieldKey(null);
    setFieldDraft("");
  }, [s?.server_id, open]);

  useEffect(() => {
    if (!open || !s) return;

    let cancelled = false;
    setNotesBusy(true);
    setNotesError(null);
    void api
      .serverNotesGet({ server_id: s.server_id })
      .then((loaded) => {
        if (cancelled) return;
        setNotes(loaded);
      })
      .catch(() => {
        if (cancelled) return;
        setNotesError("人工说明加载失败，当前展示的是自动生成说明。");
      })
      .finally(() => {
        if (cancelled) return;
        setNotesBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, s]);

  async function toggleReveal(next: boolean) {
    if (!s) return;
    if (!next) {
      setReveal(false);
      setRevealed(null);
      return;
    }
    setReveal(true);
    setRevealBusy(true);
    try {
      const r = await api.serverGet({ server_id: s.server_id, reveal_secrets: true });
      setRevealed(r);
    } finally {
      setRevealBusy(false);
    }
  }

  const shown = revealed ?? s;
  const explanation = shown ? explainServerDetails(shown, notes) : null;

  async function persistNotes(nextNotes: ServerNotes) {
    if (!s) return null;
    setNotesBusy(true);
    setNotesError(null);
    try {
      const saved = await api.serverNotesPut({ server_id: s.server_id, notes: nextNotes });
      setNotes(saved);
      return saved;
    } catch {
      setNotesError("人工说明保存失败，请稍后重试。");
      return null;
    } finally {
      setNotesBusy(false);
    }
  }

  function startDescriptionEdit() {
    if (!explanation) return;
    setEditingFieldKey(null);
    setFieldDraft("");
    setDescriptionDraft(notes.description || explanation.description);
    setEditingDescription(true);
  }

  async function saveDescription() {
    const saved = await persistNotes({
      ...notes,
      description: descriptionDraft,
    });
    if (!saved) return;
    setEditingDescription(false);
    setDescriptionDraft(saved.description);
  }

  function startFieldEdit(key: string, fallbackHint: string) {
    setEditingDescription(false);
    setDescriptionDraft("");
    setEditingFieldKey(key);
    setFieldDraft(notes.field_hints[key] || fallbackHint);
  }

  async function saveFieldHint(key: string) {
    const nextFieldHints = { ...notes.field_hints };
    if (fieldDraft.trim()) {
      nextFieldHints[key] = fieldDraft.trim();
    } else {
      delete nextFieldHints[key];
    }

    const saved = await persistNotes({
      ...notes,
      field_hints: nextFieldHints,
    });
    if (!saved) return;
    setEditingFieldKey(null);
    setFieldDraft("");
  }

  if (!open) return null;
  return (
    <div
      className="ui-dialogOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="MCP详情"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
      style={{ placeItems: "end" }}
    >
      <div
        className="ui-dialog"
        style={{
          width: "min(780px, 94vw)",
          height: "100%",
          maxHeight: "100vh",
          borderRadius: "18px 0 0 18px",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ui-dialogHeader">
          <div className="ui-dialogTitle">MCP详情</div>
          <button type="button" className="ui-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="ui-dialogBody">
          {!s ? (
            <div className="ui-help">无内容</div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              <div className="ui-card" style={{ padding: "16px" }}>
                <div className="ui-label">名称</div>
                <div className="ui-code" style={{ marginTop: "8px", fontWeight: 700 }}>
                  {formatMcpName(shown!.server_id)}
                </div>
                <div style={{ marginTop: "10px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <span className="ui-pill">
                    <span className={`ui-pillDot ${shown!.enabled ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
                    <span className="ui-code">{enabledLabel(shown!.enabled)}</span>
                  </span>
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{clientLabel(shown!.client)}</span>
                  </span>
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{transportLabel(shown!.transport)}</span>
                  </span>
                </div>
                <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <div className="ui-help">
                    {reveal ? "已尝试显示敏感值；原始配置中仍可能继续脱敏或被拒绝展示。" : "默认先展示说明化内容，原始配置可按需展开查看。"}
                  </div>
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={!canReveal || revealBusy}
                    onClick={() => toggleReveal(!reveal)}
                    title="显示敏感值（若后端允许）"
                  >
                    {revealBusy ? "加载中..." : reveal ? "隐藏敏感值" : "显示敏感值"}
                  </button>
                </div>
              </div>

              <div className="ui-card" style={{ padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                  <div className="ui-label">功能作用</div>
                  {!editingDescription ? (
                    <button type="button" className="ui-btn" disabled={notesBusy} onClick={startDescriptionEdit}>
                      编辑说明
                    </button>
                  ) : null}
                </div>
                {editingDescription ? (
                  <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
                    <textarea
                      value={descriptionDraft}
                      onChange={(e) => setDescriptionDraft(e.target.value)}
                      rows={4}
                      style={{
                        width: "100%",
                        resize: "vertical",
                        borderRadius: 12,
                        border: "1px solid var(--color-border)",
                        padding: "10px 12px",
                        font: "inherit",
                        background: "var(--color-panel)",
                        color: "var(--color-text)",
                      }}
                    />
                    <div className="ui-btnRow">
                      <button type="button" className="ui-btn" disabled={notesBusy} onClick={saveDescription}>
                        保存
                      </button>
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={notesBusy}
                        onClick={() => {
                          setEditingDescription(false);
                          setDescriptionDraft("");
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: "10px", lineHeight: 1.7 }}>{explanation?.description}</div>
                )}
                {notesError ? (
                  <div className="ui-help" style={{ marginTop: "10px" }}>
                    {notesError}
                  </div>
                ) : null}
              </div>

              <div className="ui-card" style={{ padding: "16px" }}>
                <div className="ui-label">来源文件</div>
                <div className="ui-code" style={{ marginTop: "8px" }}>
                  {shown!.source_file}
                </div>
              </div>

              <div className="ui-card" style={{ padding: "16px" }}>
                <div className="ui-label">配置说明</div>
                <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
                  {(explanation?.fields ?? []).length > 0 ? (
                    explanation?.fields.map((field) => (
                      <div
                        key={field.key}
                        style={{
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                          padding: "12px",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="ui-code" style={{ fontWeight: 700 }}>
                              {field.key}
                            </div>
                            <div className="ui-code" style={{ marginTop: "6px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {field.display_value}
                            </div>
                          </div>
                          {editingFieldKey !== field.key ? (
                            <button
                              type="button"
                              className="ui-btn"
                              disabled={notesBusy}
                              onClick={() => startFieldEdit(field.key, field.hint)}
                            >
                              编辑说明
                            </button>
                          ) : null}
                        </div>
                        {editingFieldKey === field.key ? (
                          <div style={{ display: "grid", gap: "10px" }}>
                            <textarea
                              value={fieldDraft}
                              onChange={(e) => setFieldDraft(e.target.value)}
                              rows={3}
                              style={{
                                width: "100%",
                                resize: "vertical",
                                borderRadius: 12,
                                border: "1px solid var(--color-border)",
                                padding: "10px 12px",
                                font: "inherit",
                                background: "var(--color-panel)",
                                color: "var(--color-text)",
                              }}
                            />
                            <div className="ui-btnRow">
                              <button
                                type="button"
                                className="ui-btn"
                                disabled={notesBusy}
                                onClick={() => saveFieldHint(field.key)}
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                className="ui-btn"
                                disabled={notesBusy}
                                onClick={() => {
                                  setEditingFieldKey(null);
                                  setFieldDraft("");
                                }}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="ui-help">{field.hint}</div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="ui-help">暂无可解释的配置项。</div>
                  )}
                </div>
                <details style={{ marginTop: "14px" }}>
                  <summary className="ui-label" style={{ cursor: "pointer" }}>
                    原始配置
                  </summary>
                  <div style={{ marginTop: "10px" }}>
                    <pre className="ui-pre">{JSON.stringify(shown!.payload, null, 2)}</pre>
                  </div>
                </details>
              </div>

              <div className="ui-help" style={{ marginTop: "-2px" }}>
                说明支持人工编辑，默认会先展示自动生成结果。
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
