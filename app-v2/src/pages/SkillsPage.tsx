import { useEffect, useMemo, useState } from "react";
import type {
  AppError,
  Client,
  FilePrecondition,
  SkillGetResponse,
  SkillRecord,
  WritePreview,
} from "../lib/types";
import { api } from "../lib/api";
import { clientLabel, enabledLabel, skillKindLabel, skillScopeLabel } from "../lib/format";
import { Icon } from "../components/Icon";
import { UiSelect, type UiSelectOption } from "../components/UiSelect";
import { WritePreviewDialog } from "../components/WritePreviewDialog";

type ScopeFilter = "user" | "system" | "disabled";

type PendingAction =
  | { type: "toggle"; skill_id: string; enabled: boolean }
  | { type: "create"; client: Client; name: string; description: string; body?: string };

function formatSkillName(skillId: string): string {
  if (skillId.includes(":")) {
    return skillId.split(":").slice(1).join(":");
  }
  return skillId.replace(/^(mcp__|claudecode__|codex__|claude_code__)/, "");
}

export function SkillsPage() {
  const [client, setClient] = useState<Client>("claude_code");
  const [scope, setScope] = useState<ScopeFilter>("user");
  const [skills, setSkills] = useState<SkillRecord[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<SkillRecord | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<SkillGetResponse | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createClient, setCreateClient] = useState<Client>("codex");
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createBody, setCreateBody] = useState("");

  const [preview, setPreview] = useState<WritePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("变更预览");
  const [pending, setPending] = useState<PendingAction | null>(null);

  const clientOptions = [
    { value: "claude_code", label: clientLabel("claude_code") },
    { value: "codex", label: clientLabel("codex") },
  ] satisfies Array<UiSelectOption<Client>>;

  const scopeOptions = [
    { value: "user", label: "用户" },
    { value: "system", label: "系统" },
    { value: "disabled", label: "已禁用" },
  ] satisfies Array<UiSelectOption<ScopeFilter>>;

  async function load() {
    setError(null);
    try {
      const list = await api.skillList({ client, scope });
      setSkills(list);
    } catch (e) {
      setError(e as AppError);
    }
  }

  useEffect(() => {
    load();
  }, [client, scope]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills ?? [];
    return (skills ?? []).filter((s) => {
      const hay = `${s.skill_id} ${s.name} ${s.description}`.toLowerCase();
      return hay.includes(q);
    });
  }, [skills, query]);

  async function openDetails(s: SkillRecord) {
    setSelected(s);
    setSelectedDetails(null);
    setDetailsOpen(true);
    try {
      const full = await api.skillGet({ skill_id: s.skill_id });
      setSelectedDetails(full);
    } catch {
      // best-effort
    }
  }

  async function requestToggle(s: SkillRecord, enabled: boolean) {
    if (s.scope === "system") return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setPending({ type: "toggle", skill_id: s.skill_id, enabled });
    setPreviewTitle(`切换Skill：${formatSkillName(s.skill_id)} → ${enabled ? "启用" : "停用"}`);
    try {
      const p = await api.skillPreviewToggle({ skill_id: s.skill_id, enabled });
      setPreview(p);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function requestCreate() {
    setBusy(true);
    setError(null);
    setPreview(null);

    const name = createName.trim();
    const description = createDesc.trim();
    const body = createBody.trim();
    setPending({ type: "create", client: createClient, name, description, body: body || undefined });
    setPreviewTitle(`创建Skill：${clientLabel(createClient)} / ${name || "(未命名)"}`);
    try {
      const p = await api.skillPreviewCreate({
        client: createClient,
        name,
        description,
        body: body || undefined,
      });
      setPreview(p);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function applyPending(expected_files: FilePrecondition[]) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.type === "toggle") {
        await api.skillApplyToggle({ skill_id: pending.skill_id, enabled: pending.enabled, expected_files });
      } else {
        await api.skillApplyCreate({
          client: pending.client,
          name: pending.name,
          description: pending.description,
          body: pending.body,
          expected_files,
        });
      }
      setPreviewOpen(false);
      setPending(null);
      setPreview(null);
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div className="ui-label">客户端</div>
              <div style={{ minWidth: 180 }}>
                <UiSelect<Client>
                  ariaLabel="选择客户端"
                  value={client}
                  options={clientOptions}
                  onChange={setClient}
                  disabled={busy}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div className="ui-label">范围</div>
              <div style={{ minWidth: 180 }}>
                <UiSelect<ScopeFilter>
                  ariaLabel="选择范围"
                  value={scope}
                  options={scopeOptions}
                  onChange={setScope}
                  disabled={busy}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div className="ui-label">搜索</div>
              <input
                className="ui-input"
                placeholder="name/description/skill_id"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                style={{ width: 260 }}
              />
            </div>
          </div>

          <div className="ui-btnRow">
            <button type="button" className="ui-btn" onClick={load} disabled={busy}>
              <Icon name="refresh" /> 刷新
            </button>
            <button
              type="button"
              className="ui-btn ui-btnPrimary"
              onClick={() => setCreateOpen((v) => !v)}
              disabled={busy}
              title="创建新的 Codex skill 或 Claude command"
            >
              <Icon name="plus" /> 新建
            </button>
          </div>
        </div>

        <div style={{ marginTop: "10px" }} className="ui-help">
          列表同时包含 Codex skills（目录 + SKILL.md）与 Claude Code 命令（~/.claude/commands/*.md）。
          任何写入都会先生成差异预览，确认后才会执行。
        </div>
      </div>

      {createOpen ? (
        <div className="ui-card" style={{ padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div className="ui-label">新建 Skill / 命令</div>
            <button type="button" className="ui-btn" onClick={() => setCreateOpen(false)} disabled={busy}>
              收起
            </button>
          </div>

          <div className="ui-formGrid" style={{ marginTop: "12px" }}>
            <div className="ui-field">
              <div className="ui-label">客户端</div>
              <UiSelect<Client>
                ariaLabel="选择客户端"
                value={createClient}
                options={[
                  { value: "codex", label: clientLabel("codex") },
                  { value: "claude_code", label: clientLabel("claude_code") },
                ]}
                onChange={setCreateClient}
                disabled={busy}
              />
            </div>

            <div className="ui-field">
              <div className="ui-label">名称</div>
              <input
                className="ui-input"
                placeholder={createClient === "codex" ? "例如: my-skill" : "例如: review"}
                value={createName}
                onChange={(e) => setCreateName(e.currentTarget.value)}
                disabled={busy}
              />
              <div className="ui-help">
                {createClient === "codex"
                  ? "将创建 <codex_home>/skills/<name>/SKILL.md"
                  : "将创建 ~/.claude/commands/<name>.md"}
              </div>
            </div>

            <div className="ui-field ui-fieldFull">
              <div className="ui-label">描述</div>
              <textarea
                className="ui-input"
                placeholder="一句话说明该 skill/命令的用途与触发场景"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.currentTarget.value)}
                rows={3}
                disabled={busy}
              />
              <div className="ui-help">P0 仅只读查看；此处仅用于初始化 frontmatter.description。</div>
            </div>

            <div className="ui-field ui-fieldFull">
              <div className="ui-label">正文（可选）</div>
              <textarea
                className="ui-input"
                placeholder="可留空，后端会生成一个最小模板。"
                value={createBody}
                onChange={(e) => setCreateBody(e.currentTarget.value)}
                rows={4}
                disabled={busy}
              />
            </div>

            <div className="ui-field ui-fieldFull">
              <div className="ui-btnRow">
                <button type="button" className="ui-btn ui-btnPrimary" onClick={requestCreate} disabled={busy}>
                  预览创建
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="ui-error">
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{error.code}</div>
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{error.message}</div>
        </div>
      ) : null}

      <div className="ui-tableWrap">
        <table className="ui-table" aria-label="Skills列表">
          <thead>
            <tr>
              <th className="ui-th">名称</th>
              <th className="ui-th">客户端</th>
              <th className="ui-th">范围</th>
              <th className="ui-th">类型</th>
              <th className="ui-th">状态</th>
              <th className="ui-th" style={{ width: 160 }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {(filtered ?? []).map((s) => (
              <tr
                key={s.skill_id}
                className="ui-tr"
                onClick={() => openDetails(s)}
                style={{ cursor: "pointer" }}
              >
                <td className="ui-td ui-code">{formatSkillName(s.skill_id)}</td>
                <td className="ui-td">{clientLabel(s.client)}</td>
                <td className="ui-td">
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{skillScopeLabel(s.scope)}</span>
                  </span>
                </td>
                <td className="ui-td">
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{skillKindLabel(s.kind)}</span>
                  </span>
                </td>
                <td className="ui-td">
                  <span className="ui-pill">
                    <span className={`ui-pillDot ${s.enabled ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
                    <span className="ui-code">{enabledLabel(s.enabled)}</span>
                  </span>
                </td>
                <td className="ui-td" onClick={(e) => e.stopPropagation()}>
                  <div className="ui-btnRow">
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={busy || s.scope === "system"}
                      onClick={() => requestToggle(s, !s.enabled)}
                      title={s.scope === "system" ? "系统 Skill 不支持开关" : "切换启用状态"}
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
            {skills && filtered.length === 0 ? (
              <tr>
                <td className="ui-td" colSpan={6}>
                  <div className="ui-help">暂无 Skill。</div>
                </td>
              </tr>
            ) : null}
            {!skills ? (
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
        onConfirm={applyPending}
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
  basic: SkillRecord | null;
  full: SkillGetResponse | null;
}) {
  const rec = full?.record ?? basic;
  const content = full?.content ?? "";
  if (!open) return null;
  return (
    <div
      className="ui-dialogOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Skill详情"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
      style={{ placeItems: "end" }}
    >
      <div
        className="ui-dialog"
        style={{
          width: "min(900px, 94vw)",
          height: "100%",
          maxHeight: "100vh",
          borderRadius: "18px 0 0 18px",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ui-dialogHeader">
          <div className="ui-dialogTitle">Skill 详情</div>
          <button type="button" className="ui-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="ui-dialogBody">
          {!rec ? (
            <div className="ui-help">无内容</div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              <div className="ui-card" style={{ padding: "16px" }}>
                <div className="ui-label">名称</div>
                <div className="ui-code" style={{ marginTop: "8px", fontWeight: 700 }}>
                  {formatSkillName(rec.skill_id)}
                </div>
                <div style={{ marginTop: "10px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <span className="ui-pill">
                    <span className={`ui-pillDot ${rec.enabled ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
                    <span className="ui-code">{enabledLabel(rec.enabled)}</span>
                  </span>
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{clientLabel(rec.client)}</span>
                  </span>
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{skillScopeLabel(rec.scope)}</span>
                  </span>
                  <span className="ui-pill">
                    <span className="ui-pillDot" />
                    <span className="ui-code">{skillKindLabel(rec.kind)}</span>
                  </span>
                </div>
                <div className="ui-label" style={{ marginTop: "14px" }}>
                  描述
                </div>
                <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>
                  {rec.description || "（无）"}
                </div>
              </div>

              <div className="ui-card" style={{ padding: "16px" }}>
                <div className="ui-label">入口路径</div>
                <div className="ui-code" style={{ marginTop: "8px" }}>
                  {rec.entry_path}
                </div>
                <div className="ui-label" style={{ marginTop: "14px" }}>
                  所在目录
                </div>
                <div className="ui-code" style={{ marginTop: "8px" }}>
                  {rec.container_path}
                </div>
              </div>

              <div className="ui-card" style={{ padding: "16px" }}>
                <div className="ui-label">内容（只读）</div>
                <div style={{ marginTop: "10px" }}>
                  <pre className="ui-pre">{content || "（未加载）"}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
