import { startTransition, useEffect, useMemo, useState } from "react";
import type {
  AppError,
  Client,
  FilePrecondition,
  HealthCheckResult,
  ServerEditDraft,
  ServerEditSession,
  ServerNotes,
  ServerRecord,
  WritePreview,
} from "../lib/types";
import { api } from "../lib/api";
import { createRequestCoordinator } from "../lib/config-check-flow.js";
import { clientLabel, enabledLabel, transportLabel } from "../lib/format";
import { Icon } from "../components/Icon";
import { UiSelect, type UiSelectOption } from "../components/UiSelect";
import { WritePreviewDialog } from "../components/WritePreviewDialog";
import { explainServerDetails, type ExplainedServerField } from "../lib/serverExplain";
import { ServerEditForm } from "../components/ServerEditForm";
import { ServerRawEditor } from "../components/ServerRawEditor";
import { Dialog } from "../components/Dialog";

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

const DETAIL_CARD_PADDING = "12px";
const DETAIL_STACK_GAP = "10px";
const DETAIL_HEADER_LAYOUT_STYLE = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "10px 12px",
  alignItems: "start",
} as const;
const DETAIL_ACTION_ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  flexWrap: "nowrap",
} as const;
const DETAIL_ACTION_BUTTON_STYLE = {
  padding: "8px 10px",
  borderRadius: 10,
  fontSize: "13px",
  lineHeight: 1.2,
  whiteSpace: "nowrap",
} as const;

export function ServersPage({
  onCheckConfigUpdates,
  configCheckBusy,
  onCheckRegistryExternalDiff,
  onPreviewSyncRegistryToExternal,
  onApplySyncRegistryToExternal,
  reloadToken,
  writeConfigTrigger,
  addServerTrigger,
  onWriteConfigTriggerConsumed,
  onAddServerTriggerConsumed,
  onDataChanged,
}: {
  onCheckConfigUpdates: () => Promise<void>;
  configCheckBusy: boolean;
  onCheckRegistryExternalDiff: (client: Client) => Promise<void>;
  onPreviewSyncRegistryToExternal: (client: Client) => Promise<WritePreview>;
  onApplySyncRegistryToExternal: (payload: { client: Client; expected_files: FilePrecondition[] }) => Promise<void>;
  reloadToken: number;
  writeConfigTrigger?: number;
  addServerTrigger?: number;
  onWriteConfigTriggerConsumed?: () => void;
  onAddServerTriggerConsumed?: () => void;
  onDataChanged?: () => void;
}) {
  const [client, setClient] = useState<Client>("claude_code");
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [registryBusy, setRegistryBusy] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<ServerRecord | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<ServerRecord | null>(null);

  const [preview, setPreview] = useState<WritePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("变更预览");
  const [pendingToggle, setPendingToggle] = useState<{ server_id: string; enabled: boolean } | null>(
    null,
  );
  const [pendingEdit, setPendingEdit] = useState<{ server_id: string; draft: ServerEditDraft } | null>(
    null,
  );
  const [registrySyncPreview, setRegistrySyncPreview] = useState<WritePreview | null>(null);
  const [registryPreviewOpen, setRegistryPreviewOpen] = useState(false);
  const [registryPreviewClient, setRegistryPreviewClient] = useState<Client | null>(null);
  const listLoadFlow = useMemo(() => createRequestCoordinator(), []);
  const [healthResults, setHealthResults] = useState<Map<string, HealthCheckResult>>(new Map());
  const [healthBusy, setHealthBusy] = useState(false);

  const [addServerOpen, setAddServerOpen] = useState(false);
  const [addServerName, setAddServerName] = useState("");
  const [addServerTransport, setAddServerTransport] = useState<"stdio" | "http">("stdio");
  const [addServerCommand, setAddServerCommand] = useState("");
  const [addServerArgsText, setAddServerArgsText] = useState("");
  const [addServerEnvText, setAddServerEnvText] = useState("");
  const [addServerUrl, setAddServerUrl] = useState("");
  const [addServerHeadersText, setAddServerHeadersText] = useState("");
  const [addServerBearerEnv, setAddServerBearerEnv] = useState("");
  const [addServerError, setAddServerError] = useState<AppError | null>(null);
  const [addServerBusy, setAddServerBusy] = useState(false);
  const [addServerPreview, setAddServerPreview] = useState<WritePreview | null>(null);

  function resetAddServerForm() {
    setAddServerName("");
    setAddServerTransport("stdio");
    setAddServerCommand("");
    setAddServerArgsText("");
    setAddServerEnvText("");
    setAddServerUrl("");
    setAddServerHeadersText("");
    setAddServerBearerEnv("");
    setAddServerError(null);
    setAddServerPreview(null);
  }

  function buildAddServerPayload(): {
    client: Client;
    name: string;
    transport: "stdio" | "http";
    config: Record<string, unknown>;
  } {
    const trimmedName = addServerName.trim();
    if (!trimmedName) throw { code: "VALIDATION_ERROR", message: "名称不能为空" } satisfies AppError;

    if (addServerTransport === "stdio") {
      const cmd = addServerCommand.trim();
      if (!cmd) throw { code: "VALIDATION_ERROR", message: "启动命令不能为空" } satisfies AppError;
      const args = parseLines(addServerArgsText);
      const env = client === "claude_code" ? parseKeyValue(addServerEnvText) : undefined;
      const cfg: Record<string, unknown> = { command: cmd };
      if (args.length) cfg.args = args;
      if (env && Object.keys(env).length) cfg.env = env;
      return { client, name: trimmedName, transport: addServerTransport, config: cfg };
    }

    const u = addServerUrl.trim();
    if (!u) throw { code: "VALIDATION_ERROR", message: "URL 不能为空" } satisfies AppError;
    const cfg: Record<string, unknown> = { url: u };
    if (client === "claude_code") {
      const headers = parseKeyValue(addServerHeadersText);
      if (Object.keys(headers).length) cfg.headers = headers;
    } else {
      const v = addServerBearerEnv.trim();
      if (v) cfg.bearer_token_env_var = v;
    }
    return { client, name: trimmedName, transport: addServerTransport, config: cfg };
  }

  async function requestAddServerPreview() {
    setAddServerError(null);
    setAddServerBusy(true);
    setAddServerPreview(null);
    try {
      const payload = buildAddServerPayload();
      const p = await api.serverPreviewAdd(payload);
      setAddServerPreview(p);
    } catch (e) {
      setAddServerError(e as AppError);
    } finally {
      setAddServerBusy(false);
    }
  }

  async function applyAddServer(expected_files: FilePrecondition[]) {
    setAddServerError(null);
    setAddServerBusy(true);
    try {
      const payload = buildAddServerPayload();
      await api.serverApplyAdd({ ...payload, expected_files });
      setAddServerPreview(null);
      resetAddServerForm();
      setAddServerOpen(false);
      await load();
      onDataChanged?.();
    } catch (e) {
      setAddServerError(e as AppError);
    } finally {
      setAddServerBusy(false);
    }
  }

  const transportOptions = [
    { value: "stdio", label: "stdio" },
    { value: "http", label: "http" },
  ] satisfies Array<UiSelectOption<"stdio" | "http">>;

  const clientOptions = [
    { value: "claude_code", label: clientLabel("claude_code") },
    { value: "codex", label: clientLabel("codex") },
  ] satisfies Array<UiSelectOption<Client>>;

  async function load() {
    const requestId = listLoadFlow.begin();
    setError(null);
    try {
      const list = await api.serverList({ client });
      if (!listLoadFlow.isLatest(requestId)) return;
      setServers(list);
    } catch (e) {
      if (!listLoadFlow.isLatest(requestId)) return;
      setError(e as AppError);
    }
  }

  useEffect(() => {
    setHealthResults(new Map());
    void load();
  }, [client, reloadToken]);

  useEffect(() => {
    if (!writeConfigTrigger) return;
    void requestRegistrySyncPreview();
    onWriteConfigTriggerConsumed?.();
  }, [writeConfigTrigger]);

  useEffect(() => {
    if (!addServerTrigger) return;
    setAddServerOpen(true);
    onAddServerTriggerConsumed?.();
  }, [addServerTrigger]);

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
    setPendingEdit(null);
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

  async function requestEditPreview(server_id: string, draft: ServerEditDraft) {
    setBusy(true);
    try {
      setPreview(null);
      setPendingToggle(null);
      setPendingEdit({ server_id, draft });
      setPreviewTitle(`编辑MCP：${server_id}`);
      const p = await api.serverPreviewEdit({ server_id, draft });
      setPreview(p);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function applyPreview(expected_files: FilePrecondition[]) {
    if (!pendingToggle && !pendingEdit) return;
    setBusy(true);
    try {
      if (pendingToggle) {
        await api.serverApplyToggle({ ...pendingToggle, expected_files });
      } else if (pendingEdit) {
        await api.serverApplyEdit({
          ...pendingEdit,
          expected_files,
        });
        setDetailsOpen(false);
        setSelected(null);
        setSelectedDetails(null);
      }
      setPreviewOpen(false);
      setPendingToggle(null);
      setPendingEdit(null);
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function requestRegistryExternalDiff() {
    setRegistryBusy(true);
    setError(null);
    try {
      await onCheckRegistryExternalDiff(client);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setRegistryBusy(false);
    }
  }

  async function requestRegistrySyncPreview() {
    setRegistryBusy(true);
    setError(null);
    try {
      const previewRequest = { client: client };
      const preview = await onPreviewSyncRegistryToExternal(previewRequest.client);
      startTransition(() => {
        setRegistryPreviewClient(client);
        setRegistrySyncPreview(preview);
        setRegistryPreviewOpen(true);
      });
    } catch (e) {
      setError(e as AppError);
    } finally {
      setRegistryBusy(false);
    }
  }

  async function applyRegistrySyncPreview(expected_files: FilePrecondition[]) {
    if (!registryPreviewClient) return;
    setRegistryBusy(true);
    setError(null);
    try {
      await onApplySyncRegistryToExternal({ client: registryPreviewClient, expected_files });
      setRegistryPreviewOpen(false);
      setRegistrySyncPreview(null);
      setRegistryPreviewClient(null);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setRegistryBusy(false);
    }
  }

  async function runHealthCheck(serverId: string) {
    setHealthResults((prev) => {
      const next = new Map(prev);
      next.set(serverId, {
        server_id: serverId,
        status: "checking" as const,
        checked_at: new Date().toISOString(),
      });
      return next;
    });
    try {
      const result = await api.mcpHealthCheck({ server_id: serverId });
      setHealthResults((prev) => {
        const next = new Map(prev);
        next.set(serverId, result);
        return next;
      });
    } catch (e) {
      setHealthResults((prev) => {
        const next = new Map(prev);
        next.set(serverId, {
          server_id: serverId,
          status: "fail" as const,
          error: (e as AppError).message,
          checked_at: new Date().toISOString(),
        });
        return next;
      });
    }
  }

  async function runHealthCheckAll() {
    if (!servers) return;
    const enabled = servers.filter((s) => s.enabled);
    if (enabled.length === 0) return;

    setHealthBusy(true);
    const checking = new Map(healthResults);
    for (const s of enabled) {
      checking.set(s.server_id, {
        server_id: s.server_id,
        status: "checking" as const,
        checked_at: new Date().toISOString(),
      });
    }
    setHealthResults(new Map(checking));

    try {
      const results = await api.mcpHealthCheckAll({ client });
      setHealthResults(() => {
        const next = new Map<string, HealthCheckResult>();
        for (const r of results) {
          next.set(r.server_id, r);
        }
        return next;
      });
    } catch (e) {
      setError(e as AppError);
    } finally {
      setHealthBusy(false);
    }
  }

  function renderHealthStatus(serverId: string, enabled: boolean) {
    const result = healthResults.get(serverId);
    if (!result) {
      if (!enabled) return null;
      return (
        <button
          type="button"
          className="ui-btn"
          style={{ padding: "2px 8px", fontSize: "12px", borderRadius: 6 }}
          onClick={() => runHealthCheck(serverId)}
          disabled={healthBusy}
        >
          检测
        </button>
      );
    }
    switch (result.status) {
      case "checking":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-muted)" }}>
            <span className="ui-spinner" /> 检测中
          </span>
        );
      case "ok":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#22c55e" }}>
            <span style={{ fontWeight: 700 }}>&#10003;</span>
            {result.latency_ms != null ? `${result.latency_ms}ms` : ""}
          </span>
        );
      case "timeout":
        return (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#f59e0b", cursor: "pointer" }}
            title={result.error ?? ""}
          >
            <span style={{ fontWeight: 700 }}>&#9203;</span>
            连接超时
          </span>
        );
      case "fail":
        return (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#ef4444", cursor: "pointer" }}
            title={result.error ?? ""}
          >
            <span style={{ fontWeight: 700 }}>&#10007;</span>
            {result.error && result.error.length > 16 ? result.error.slice(0, 16) + "..." : (result.error ?? "失败")}
          </span>
        );
    }
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <section className="ui-pageSummary">
        <div className="ui-pageSummaryGrid">
          <div className="ui-pageSummaryCard">
            <div className="ui-label">运行工作区</div>
            <div className="ui-pageSummaryValue">{servers?.length ?? 0}</div>
            <div className="ui-help">MCP 总数</div>
          </div>
          <div className="ui-pageSummaryCard">
            <div className="ui-label">已启用</div>
            <div className="ui-pageSummaryValue">
              {(servers ?? []).filter((server) => server.enabled).length}
            </div>
            <div className="ui-help">活跃端点</div>
          </div>
          <div className="ui-pageSummaryCard">
            <div className="ui-label">写入准备度</div>
            <div className="ui-pageSummaryValue">{registryBusy ? "检测中" : "就绪"}</div>
            <div className="ui-help">写入前需预览确认</div>
          </div>
        </div>
      </section>

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
            <button type="button" className="ui-btn" onClick={load} disabled={busy} title="重新加载 MCP 列表">
              <Icon name="refresh" /> 刷新
            </button>
            <button
              type="button"
              className="ui-btn"
              onClick={runHealthCheckAll}
              disabled={busy || healthBusy || !servers || servers.filter((s) => s.enabled).length === 0}
              title="检测所有已启用 MCP 的连通性"
            >
              <Icon name="refresh" /> 全部检测
            </button>
            <button
              type="button"
              className="ui-btn"
              onClick={requestRegistryExternalDiff}
              disabled={busy || registryBusy}
              title="对比项目配置与本机配置的差异"
            >
              检测差异
            </button>
            <button type="button" className="ui-btn" onClick={onCheckConfigUpdates} disabled={busy || configCheckBusy} title="检查客户端配置是否有外部变更">
              <Icon name="refresh" /> 检查更新
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="ui-error">
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{error.code}</div>
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{error.message}</div>
        </div>
      ) : null}

      <div className="ui-workspaceLayout">
        <section className="ui-workspaceMain">
          <div className="ui-cardTitleRow">
            <h2 className="ui-sectionTitle">MCP 列表</h2>
          </div>

          <div className="ui-tableWrap">
            <table className="ui-table ui-tableMcp ui-tableNoStickyLastCol" aria-label="MCP列表">
          <colgroup>
            <col className="ui-colName" />
            <col className="ui-colTransport" />
            <col className="ui-colStatus" />
            <col className="ui-colHealth" />
            <col className="ui-colAction" />
          </colgroup>
          <thead>
            <tr>
              <th className="ui-th">名称</th>
              <th className="ui-th">传输方式</th>
              <th className="ui-th">启用状态</th>
              <th className="ui-th">连通性</th>
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
                  <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                    {renderHealthStatus(s.server_id, s.enabled)}
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
                <td className="ui-td" colSpan={5}>
                  <div className="ui-help">暂无 MCP。</div>
                </td>
              </tr>
            ) : null}
            {!servers ? (
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
            <h3 className="ui-sidePanelTitle">提示</h3>
            <p className="ui-sidePanelText">
              点击 MCP 行查看详情，所有写入操作需预览确认。
            </p>
          </div>
        </aside>
      </div>

      <DetailsDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        basic={selected}
        full={selectedDetails}
        busy={busy}
        onRequestEditPreview={requestEditPreview}
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
        onConfirm={applyPreview}
      />
      <WritePreviewDialog
        title="写入项目内 MCP 到本地"
        preview={registrySyncPreview}
        open={registryPreviewOpen}
        busy={registryBusy}
        onClose={() => {
          if (registryBusy) return;
          setRegistryPreviewOpen(false);
          setRegistryPreviewClient(null);
        }}
        onConfirm={applyRegistrySyncPreview}
      />

      <Dialog
        title="添加 MCP 服务器"
        open={addServerOpen}
        onClose={() => {
          if (addServerBusy) return;
          resetAddServerForm();
          setAddServerOpen(false);
        }}
        footer={
          <div className="ui-btnRow">
            <button
              type="button"
              className="ui-btn"
              disabled={addServerBusy}
              onClick={() => {
                resetAddServerForm();
                setAddServerOpen(false);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="ui-btn ui-btnPrimary"
              disabled={addServerBusy}
              onClick={requestAddServerPreview}
            >
              {addServerBusy ? "生成预览中..." : "生成变更预览"}
            </button>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "16px" }}>
          <div className="ui-pageSummaryCard ui-dialogSummaryCard">
            <div className="ui-label">新增 MCP</div>
            <div className="ui-pageSummaryValue">
              {addServerTransport === "stdio" ? "stdio" : "http"}
            </div>
          </div>

          {addServerError ? (
            <div className="ui-error">
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{addServerError.code}</div>
              <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{addServerError.message}</div>
            </div>
          ) : null}

          <div className="ui-workspaceLayout">
            <section className="ui-workspaceMain">
              <div className="ui-card" style={{ padding: "18px" }}>
                <div className="ui-cardTitleRow">
                  <h3 className="ui-sectionTitle">基础信息</h3>
                </div>
                <div className="ui-formGrid" style={{ marginTop: "12px" }}>
                  <div className="ui-field">
                    <div className="ui-label">客户端</div>
                    <UiSelect<Client>
                      ariaLabel="选择客户端"
                      value={client}
                      options={clientOptions}
                      onChange={setClient}
                    />
                    <div className="ui-help">将写入该客户端的全局配置。</div>
                  </div>

                  <div className="ui-field">
                    <div className="ui-label">传输方式</div>
                    <UiSelect<"stdio" | "http">
                      ariaLabel="选择传输方式"
                      value={addServerTransport}
                      options={transportOptions}
                      onChange={setAddServerTransport}
                    />
                  </div>

                  <div className="ui-field ui-fieldFull">
                    <div className="ui-label">名称</div>
                    <input
                      className="ui-input"
                      value={addServerName}
                      onChange={(e) => setAddServerName(e.currentTarget.value)}
                      placeholder="例如: context7 / github / local_files"
                    />
                    <div className="ui-help">将作为 mcpServers 的 key。</div>
                  </div>
                </div>
              </div>

              <div className="ui-card" style={{ padding: "18px" }}>
                <div className="ui-cardTitleRow">
                  <h3 className="ui-sectionTitle">
                    {addServerTransport === "stdio" ? "stdio 配置" : "http 配置"}
                  </h3>
                </div>
                {addServerTransport === "stdio" ? (
                  <div className="ui-formGrid" style={{ marginTop: "12px" }}>
                    <div className="ui-field ui-fieldFull">
                      <div className="ui-label">启动命令</div>
                      <input
                        className="ui-input ui-code"
                        value={addServerCommand}
                        onChange={(e) => setAddServerCommand(e.currentTarget.value)}
                        placeholder="例如: npx"
                      />
                    </div>
                    <div className="ui-field ui-fieldFull">
                      <div className="ui-label">参数（每行一个）</div>
                      <textarea
                        className="ui-textarea ui-code"
                        rows={3}
                        value={addServerArgsText}
                        onChange={(e) => setAddServerArgsText(e.currentTarget.value)}
                        placeholder={"-y\n@upstash/context7-mcp"}
                      />
                    </div>
                    {client === "claude_code" ? (
                      <div className="ui-field ui-fieldFull">
                        <div className="ui-label">环境变量（每行 KEY=VALUE）</div>
                        <textarea
                          className="ui-textarea ui-code"
                          rows={3}
                          value={addServerEnvText}
                          onChange={(e) => setAddServerEnvText(e.currentTarget.value)}
                          placeholder={"API_KEY=xxxx"}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="ui-formGrid" style={{ marginTop: "12px" }}>
                    <div className="ui-field ui-fieldFull">
                      <div className="ui-label">访问地址</div>
                      <input
                        className="ui-input ui-code"
                        value={addServerUrl}
                        onChange={(e) => setAddServerUrl(e.currentTarget.value)}
                        placeholder="http://localhost:8080/mcp"
                      />
                    </div>
                    {client === "claude_code" ? (
                      <div className="ui-field ui-fieldFull">
                        <div className="ui-label">请求头（每行 KEY=VALUE）</div>
                        <textarea
                          className="ui-textarea ui-code"
                          rows={3}
                          value={addServerHeadersText}
                          onChange={(e) => setAddServerHeadersText(e.currentTarget.value)}
                          placeholder={"Authorization=Bearer xxx"}
                        />
                      </div>
                    ) : (
                      <div className="ui-field ui-fieldFull">
                        <div className="ui-label">Bearer Token 环境变量（可选）</div>
                        <input
                          className="ui-input ui-code"
                          value={addServerBearerEnv}
                          onChange={(e) => setAddServerBearerEnv(e.currentTarget.value)}
                          placeholder="FIGMA_OAUTH_TOKEN"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <aside className="ui-workspaceSide">
              <div className="ui-sidePanelCard">
                <h3 className="ui-sidePanelTitle">提示</h3>
                <p className="ui-sidePanelText">
                  选择传输方式后填写对应配置，完成后进入变更预览。
                </p>
              </div>
            </aside>
          </div>
        </div>
      </Dialog>

      <WritePreviewDialog
        title="新增MCP预览"
        preview={addServerPreview}
        open={addServerPreview != null}
        busy={addServerBusy}
        onClose={() => {
          if (addServerBusy) return;
          setAddServerPreview(null);
        }}
        onConfirm={applyAddServer}
      />
    </div>
  );
}

function DetailsDrawer({
  open,
  onClose,
  basic,
  full,
  busy,
  onRequestEditPreview,
}: {
  open: boolean;
  onClose: () => void;
  basic: ServerRecord | null;
  full: ServerRecord | null;
  busy: boolean;
  onRequestEditPreview: (server_id: string, draft: ServerEditDraft) => Promise<void>;
}) {
  const s = full ?? basic;
  const canReveal = Boolean(s);
  const [reveal, setReveal] = useState(false);
  const [revealBusy, setRevealBusy] = useState(false);
  const [revealed, setRevealed] = useState<ServerRecord | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editorTab, setEditorTab] = useState<"form" | "raw">("form");
  const [editSession, setEditSession] = useState<ServerEditSession | null>(null);
  const [workingDraft, setWorkingDraft] = useState<ServerEditDraft | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [notes, setNotes] = useState<ServerNotes>(EMPTY_SERVER_NOTES);
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [configViewMode, setConfigViewMode] = useState<"summary" | "raw">("summary");
  const [detailPanel, setDetailPanel] = useState<"none" | "fields" | "raw">("none");

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
    setConfigPanelOpen(false);
    setConfigViewMode("summary");
    setDetailPanel("none");
    setMode("view");
    setEditorTab("form");
    setEditSession(null);
    setWorkingDraft(null);
    setEditBusy(false);
    setEditError(null);
    setRawError(null);
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
        setNotesError("说明加载失败，显示自动生成内容。");
      })
      .finally(() => {
        if (cancelled) return;
        setNotesBusy(false);
      });

    return () => {
      cancelled = true;
      setNotesBusy(false);
    };
  }, [open, s?.server_id]);

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
  const summaryFields = explanation?.summary_fields ?? [];
  const remainingFields = (explanation?.fields ?? []).filter(
    (field) => !summaryFields.some((summaryField) => summaryField.key === field.key),
  );
  const unknownFields =
    editSession && workingDraft
      ? Object.keys(workingDraft.payload).filter((key) => !editSession.field_meta.known_fields.includes(key)).sort()
      : [];

  async function persistNotes(nextNotes: ServerNotes) {
    if (!s) return null;
    setNotesBusy(true);
    setNotesError(null);
    try {
      const saved = await api.serverNotesPut({ server_id: s.server_id, notes: nextNotes });
      setNotes(saved);
      return saved;
    } catch {
      setNotesError("说明保存失败，请重试。");
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

  function toggleDetailPanel(nextPanel: "fields" | "raw") {
    setEditingFieldKey(null);
    setFieldDraft("");
    setDetailPanel((current) => (current === nextPanel ? "none" : nextPanel));
  }

  function toggleConfigPanel() {
    setEditingFieldKey(null);
    setFieldDraft("");
    setConfigPanelOpen((current) => {
      if (current) {
        setDetailPanel("none");
        setConfigViewMode("summary");
      }
      return !current;
    });
  }

  function switchConfigViewMode(nextMode: "summary" | "raw") {
    setConfigViewMode(nextMode);
    if (nextMode === "raw") {
      setDetailPanel("none");
    }
  }

  function renderFieldCard(field: ExplainedServerField, compact = false) {
    return (
      <div
        key={field.key}
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          padding: compact ? "10px 12px" : "12px",
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
              style={DETAIL_ACTION_BUTTON_STYLE}
              disabled={notesBusy}
              onClick={() => startFieldEdit(field.key, field.hint)}
            >
              编辑字段说明
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
                style={DETAIL_ACTION_BUTTON_STYLE}
                disabled={notesBusy}
                onClick={() => saveFieldHint(field.key)}
              >
                保存
              </button>
              <button
                type="button"
                className="ui-btn"
                style={DETAIL_ACTION_BUTTON_STYLE}
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
    );
  }

  async function startEdit() {
    if (!s) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const session = await api.serverGetEditSession({ server_id: s.server_id });
      setEditSession(session);
      setWorkingDraft({
        transport: session.transport,
        payload: session.raw_fragment_json,
      });
      setMode("edit");
      setEditorTab("form");
    } catch {
      setEditError("编辑会话加载失败，请重试。");
    } finally {
      setEditBusy(false);
    }
  }

  function updateDraftPayload(nextPayload: Record<string, unknown>) {
    setWorkingDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        payload: nextPayload,
      };
    });
  }

  async function requestConfigPreview() {
    if (!s || !workingDraft || rawError) return;
    await onRequestEditPreview(s.server_id, workingDraft);
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
          <div className="ui-dialogTitleWrap">
            <div className="ui-dialogEyebrow">MCP</div>
            <div className="ui-dialogTitle">MCP 详情</div>
          </div>
          <button type="button" className="ui-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="ui-dialogBody">
          {!s ? (
            <div className="ui-help">无内容</div>
          ) : mode === "edit" && workingDraft && editSession ? (
            <div style={{ display: "grid", gap: DETAIL_STACK_GAP }}>
              <div className="ui-card" style={{ padding: DETAIL_CARD_PADDING }}>
                <div className="ui-label">名称</div>
                <div className="ui-code" style={{ marginTop: "8px", fontWeight: 700 }}>
                  {formatMcpName(s.server_id)}
                </div>
                <div style={{ marginTop: "10px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <span className="ui-pill">
                    <span className={`ui-pillDot ${s.enabled ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
                    <span className="ui-code">{enabledLabel(s.enabled)}</span>
                  </span>
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{clientLabel(s.client)}</span>
                  </span>
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{transportLabel(workingDraft.transport)}</span>
                  </span>
                </div>
                <div style={{ marginTop: "8px" }} className="ui-code">
                  当前来源：{editSession.source_file}
                </div>
                <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <div className="ui-btnRow">
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={busy || editBusy}
                      onClick={() => {
                        setMode("view");
                        setEditError(null);
                        setRawError(null);
                      }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={busy || editBusy || Boolean(rawError)}
                      onClick={requestConfigPreview}
                    >
                      生成预览
                    </button>
                  </div>
                </div>
                {editError ? (
                  <div className="ui-help" style={{ marginTop: "10px" }}>
                    {editError}
                  </div>
                ) : null}
              </div>

              <div className="ui-card" style={{ padding: DETAIL_CARD_PADDING }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={busy || editBusy}
                    onClick={() => setEditorTab("form")}
                  >
                    基础编辑
                  </button>
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={busy || editBusy}
                    onClick={() => setEditorTab("raw")}
                  >
                    高级编辑
                  </button>
                </div>

                {editorTab === "form" ? (
                  <ServerEditForm
                    client={s.client}
                    transport={workingDraft.transport}
                    payload={workingDraft.payload}
                    unknownFields={unknownFields}
                    onChange={updateDraftPayload}
                  />
                ) : (
                  <ServerRawEditor
                    payload={workingDraft.payload}
                    onChange={updateDraftPayload}
                    onValidityChange={setRawError}
                  />
                )}
              </div>

            </div>
          ) : (
            <div style={{ display: "grid", gap: DETAIL_STACK_GAP }}>
              <div className="ui-pageSummaryCard ui-dialogSummaryCard" style={{ padding: DETAIL_CARD_PADDING }}>
                <div style={DETAIL_HEADER_LAYOUT_STYLE}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ui-label">名称</div>
                    <div className="ui-code" style={{ marginTop: "8px", fontWeight: 700 }}>
                      {formatMcpName(shown!.server_id)}
                    </div>
                    <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                    <div style={{ marginTop: "8px" }} className="ui-code">
                      当前来源：{shown!.source_file}
                    </div>
                  </div>
                  <div style={{ ...DETAIL_ACTION_ROW_STYLE, justifySelf: "end", alignSelf: "center" }}>
                    <button
                      type="button"
                      className="ui-btn"
                      style={DETAIL_ACTION_BUTTON_STYLE}
                      disabled={busy || editBusy}
                      onClick={startEdit}
                    >
                      编辑配置
                    </button>
                    <button
                      type="button"
                      className="ui-btn"
                      style={DETAIL_ACTION_BUTTON_STYLE}
                      disabled={!canReveal || revealBusy || busy}
                      onClick={() => toggleReveal(!reveal)}
                      title="显示敏感信息"
                    >
                      {revealBusy ? "加载中..." : reveal ? "隐藏敏感信息" : "显示敏感信息"}
                    </button>
                  </div>
                </div>
                {editError ? (
                  <div className="ui-help" style={{ marginTop: "8px" }}>
                    {editError}
                  </div>
                ) : null}
              </div>

              <div className="ui-dialogSectionCard" style={{ padding: DETAIL_CARD_PADDING }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                  <div className="ui-label">功能作用</div>
                  {!editingDescription ? (
                    <button
                      type="button"
                      className="ui-btn"
                      style={DETAIL_ACTION_BUTTON_STYLE}
                      disabled={notesBusy}
                      onClick={startDescriptionEdit}
                    >
                      编辑功能说明
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
                      <button
                        type="button"
                        className="ui-btn"
                        style={DETAIL_ACTION_BUTTON_STYLE}
                        disabled={notesBusy}
                        onClick={saveDescription}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="ui-btn"
                        style={DETAIL_ACTION_BUTTON_STYLE}
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
                  <div style={{ marginTop: "8px", lineHeight: 1.6 }}>{explanation?.description}</div>
                )}
                {notesError ? (
                  <div className="ui-help" style={{ marginTop: "8px" }}>
                    {notesError}
                  </div>
                ) : null}
              </div>

              <div className="ui-dialogSectionCard" style={{ padding: DETAIL_CARD_PADDING }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <div className="ui-label">配置说明</div>
                  <div style={{ ...DETAIL_ACTION_ROW_STYLE, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="ui-btn"
                      style={DETAIL_ACTION_BUTTON_STYLE}
                      disabled={notesBusy}
                      onClick={toggleConfigPanel}
                    >
                      {configPanelOpen ? "收起配置说明" : "展开配置说明"}
                    </button>
                    {configPanelOpen && configViewMode === "summary" && remainingFields.length > 0 ? (
                      <button
                        type="button"
                        className="ui-btn"
                        style={DETAIL_ACTION_BUTTON_STYLE}
                        disabled={notesBusy}
                        onClick={() => toggleDetailPanel("fields")}
                      >
                        {detailPanel === "fields" ? "收起其余说明" : `展开其余 ${remainingFields.length} 项`}
                      </button>
                    ) : null}
                    {configPanelOpen ? (
                      <button
                        type="button"
                        className="ui-btn"
                        style={DETAIL_ACTION_BUTTON_STYLE}
                        disabled={notesBusy}
                        onClick={() => switchConfigViewMode(configViewMode === "summary" ? "raw" : "summary")}
                      >
                        {configViewMode === "summary" ? "切换到原始配置" : "切换到配置摘要"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {configPanelOpen && configViewMode === "summary" ? (
                  <>
                    <div className="ui-label" style={{ marginTop: "8px" }}>配置摘要</div>
                    <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                      {summaryFields.length > 0 ? (
                        summaryFields.map((field) => renderFieldCard(field, true))
                      ) : (
                        <div className="ui-help">暂无配置项。</div>
                      )}
                    </div>
                  </>
                ) : null}
                {configPanelOpen && configViewMode === "summary" && detailPanel === "fields" && remainingFields.length > 0 ? (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--color-border)" }}>
                    <div className="ui-label">其余配置说明</div>
                    <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                      {remainingFields.map((field) => renderFieldCard(field))}
                    </div>
                  </div>
                ) : null}
                {configPanelOpen && configViewMode === "raw" ? (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--color-border)" }}>
                    <div className="ui-label">原始配置</div>
                    <div style={{ marginTop: "8px" }}>
                      <pre className="ui-pre">{JSON.stringify(shown!.payload, null, 2)}</pre>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKeyValue(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}
