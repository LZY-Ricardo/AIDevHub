import { useEffect, useState } from "react";
import type { AppError, Client, FilePrecondition, ServerRecord, WritePreview } from "../lib/types";
import { api } from "../lib/api";
import { clientLabel, enabledLabel, transportLabel } from "../lib/format";
import { Icon } from "../components/Icon";
import { UiSelect, type UiSelectOption } from "../components/UiSelect";
import { WritePreviewDialog } from "../components/WritePreviewDialog";

export function ServersPage() {
  const [client, setClient] = useState<Client | "all">("all");
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
    { value: "all", label: "全部" },
    { value: "claude_code", label: clientLabel("claude_code") },
    { value: "codex", label: clientLabel("codex") },
  ] satisfies Array<UiSelectOption<Client | "all">>;

  async function load() {
    setError(null);
    try {
      const list = await api.serverList(client === "all" ? {} : { client });
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
              <UiSelect<Client | "all">
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
        <table className="ui-table" aria-label="MCP列表">
          <thead>
            <tr>
              <th className="ui-th">MCP ID</th>
              <th className="ui-th">客户端</th>
              <th className="ui-th">传输方式</th>
              <th className="ui-th">启用状态</th>
              <th className="ui-th">标识</th>
              <th className="ui-th" style={{ width: 160 }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {(servers ?? []).map((s) => (
              <tr
                key={s.server_id}
                className="ui-tr"
                onClick={() => openDetails(s)}
                style={{ cursor: "pointer" }}
              >
                <td className="ui-td ui-code">{s.server_id}</td>
                <td className="ui-td">{clientLabel(s.client)}</td>
                <td className="ui-td">
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{transportLabel(s.transport)}</span>
                  </span>
                </td>
                <td className="ui-td">
                  <span className="ui-pill">
                    <span className={`ui-pillDot ${s.enabled ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
                    <span className="ui-code">{enabledLabel(s.enabled)}</span>
                  </span>
                </td>
                <td
                  className="ui-td ui-code"
                  style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {s.identity}
                </td>
                <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                  <div className="ui-btnRow">
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
            ))}
            {servers && servers.length === 0 ? (
              <tr>
                <td className="ui-td" colSpan={6}>
                  <div className="ui-help">暂无 MCP。</div>
                </td>
              </tr>
            ) : null}
            {!servers ? (
              <tr>
                <td className="ui-td" colSpan={6}>
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

  useEffect(() => {
    setReveal(false);
    setRevealed(null);
    setRevealBusy(false);
  }, [s?.server_id, open]);

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
                <div className="ui-label">MCP ID</div>
                <div className="ui-code" style={{ marginTop: "8px", fontWeight: 700 }}>
                  {shown!.server_id}
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
                    {reveal ? "已尝试显示敏感值（后端可能仍会脱敏或拒绝）" : "默认仅展示脱敏后的配置载荷"}
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
                <div className="ui-label">来源文件</div>
                <div className="ui-code" style={{ marginTop: "8px" }}>
                  {shown!.source_file}
                </div>
                <div className="ui-label" style={{ marginTop: "14px" }}>
                  标识
                </div>
                <div className="ui-code" style={{ marginTop: "8px" }}>
                  {shown!.identity}
                </div>
              </div>

              <div className="ui-card" style={{ padding: "16px" }}>
                <div className="ui-label">配置载荷（默认脱敏）</div>
                <div style={{ marginTop: "10px" }}>
                  <pre className="ui-pre">{JSON.stringify(shown!.payload, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
