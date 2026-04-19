import { useEffect, useMemo, useState } from "react";
import type { AppError, Client, FilePrecondition, Profile, ServerRecord, WritePreview } from "../lib/types";
import { api } from "../lib/api";
import { clientLabel, isoToLocal } from "../lib/format";
import { Icon } from "../components/Icon";
import { UiSelect, type UiSelectOption } from "../components/UiSelect";
import { WritePreviewDialog } from "../components/WritePreviewDialog";

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => (profiles ?? []).find((p) => p.profile_id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const profileOptions = useMemo(() => {
    return (profiles ?? []).map((p) => ({ value: p.profile_id, label: p.name })) satisfies Array<
      UiSelectOption<string>
    >;
  }, [profiles]);

  const [editName, setEditName] = useState("");
  const [editTargetsClaude, setEditTargetsClaude] = useState<string[]>([]);
  const [editTargetsCodex, setEditTargetsCodex] = useState<string[]>([]);

  const [preview, setPreview] = useState<WritePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("方案预览");
  const [pendingApply, setPendingApply] = useState<{ profile_id: string; client: Client } | null>(null);

  async function load() {
    setError(null);
    try {
      const [p, s] = await Promise.all([api.profileList(), api.serverList()]);
      setProfiles(p);
      setServers(s);
      if (!selectedId && p.length) setSelectedId(p[0].profile_id);
    } catch (e) {
      setError(e as AppError);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditTargetsClaude(selected.targets.claude_code.slice());
    setEditTargetsCodex(selected.targets.codex.slice());
  }, [selected?.profile_id]);

  const claudeServers = useMemo(
    () => (servers ?? []).filter((s) => s.client === "claude_code"),
    [servers],
  );
  const codexServers = useMemo(() => (servers ?? []).filter((s) => s.client === "codex"), [servers]);

  async function createProfile() {
    setError(null);
    setBusy(true);
    try {
      const created = await api.profileCreate({
        name: `方案 ${new Date().toLocaleDateString("zh-CN")}`,
        targets: { claude_code: [], codex: [] },
      });
      await load();
      setSelectedId(created.profile_id);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      const targets = {
        claude_code: normalizeServerIds(editTargetsClaude),
        codex: normalizeServerIds(editTargetsCodex),
      };
      const name = editName.trim() || selected.name;
      await api.profileUpdate({ profile_id: selected.profile_id, name, targets });
      await load();
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile() {
    if (!selected) return;
    const ok = window.confirm(`确定删除方案“${selected.name}”吗？`);
    if (!ok) return;
    setError(null);
    setBusy(true);
    try {
      await api.profileDelete({ profile_id: selected.profile_id });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function previewApply(client: Client) {
    if (!selected) return;
    setError(null);
    setBusy(true);
    setPreview(null);
    setPendingApply({ profile_id: selected.profile_id, client });
    setPreviewTitle(`应用方案：${selected.name} → ${clientLabel(client)}`);
    try {
      const p = await api.profilePreviewApply({ profile_id: selected.profile_id, client });
      setPreview(p);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function applyProfile(expected_files: FilePrecondition[]) {
    if (!pendingApply) return;
    setError(null);
    setBusy(true);
    try {
      await api.profileApply({ ...pendingApply, expected_files });
      setPreviewOpen(false);
      setPendingApply(null);
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
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{error.message}</div>
        </div>
      ) : null}

      <div className="ui-card" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div className="ui-label">方案</div>
            <div style={{ minWidth: 260, maxWidth: 520 }}>
              <UiSelect<string>
                ariaLabel="选择方案"
                value={selectedId ?? ""}
                options={profileOptions}
                onChange={(id) => setSelectedId(id)}
                disabled={busy || profileOptions.length === 0}
              />
            </div>
            <button type="button" className="ui-btn" onClick={createProfile} disabled={busy}>
              <Icon name="plus" /> 新建
            </button>
            <button type="button" className="ui-btn" onClick={load} disabled={busy}>
              <Icon name="refresh" /> 刷新
            </button>
          </div>
          <div className="ui-btnRow">
            <button type="button" className="ui-btn ui-btnDanger" onClick={deleteProfile} disabled={busy || !selected}>
              删除
            </button>
          </div>
        </div>
        <div style={{ marginTop: "10px" }} className="ui-help">
          应用方案后，启用列表将精确等于所选 targets（缺失的 MCP 会跳过并提示）。
        </div>
      </div>

      {!selected ? (
        <div className="ui-help">暂无方案，先新建一个。</div>
      ) : (
        <div className="ui-card">
          <div className="ui-formGrid">
            <div className="ui-field ui-fieldFull">
              <div className="ui-label">名称</div>
              <input className="ui-input" value={editName} onChange={(e) => setEditName(e.currentTarget.value)} />
              <div className="ui-help">更新时间: {isoToLocal(selected.updated_at)}</div>
            </div>

            <div className="ui-field ui-fieldFull">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                <div className="ui-label">目标 MCP</div>
                <div className="ui-btnRow">
                  <button type="button" className="ui-btn" onClick={saveProfile} disabled={busy}>
                    保存
                  </button>
                  <button type="button" className="ui-btn ui-btnPrimary" onClick={() => previewApply("claude_code")} disabled={busy}>
                    预览应用到 {clientLabel("claude_code")}
                  </button>
                  <button type="button" className="ui-btn ui-btnPrimary" onClick={() => previewApply("codex")} disabled={busy}>
                    预览应用到 {clientLabel("codex")}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <TargetSelector
                  title={clientLabel("claude_code")}
                  servers={claudeServers}
                  selected={editTargetsClaude}
                  onChange={setEditTargetsClaude}
                />
                <TargetSelector
                  title={clientLabel("codex")}
                  servers={codexServers}
                  selected={editTargetsCodex}
                  onChange={setEditTargetsCodex}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <WritePreviewDialog
        title={previewTitle}
        preview={preview}
        open={previewOpen}
        busy={busy}
        onClose={() => {
          if (busy) return;
          setPreviewOpen(false);
        }}
        onConfirm={applyProfile}
      />
    </div>
  );
}

function TargetSelector({
  title,
  servers,
  selected,
  onChange,
}: {
  title: string;
  servers: ServerRecord[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const set = useMemo(() => new Set(selected), [selected]);

  return (
    <div className="ui-card" style={{ padding: "16px", margin: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{title}</div>
        <span className="ui-badge">{selected.length}</span>
      </div>
      <div style={{ marginTop: "10px" }} className="ui-help">
        勾选后将作为该客户端的启用列表。
      </div>

      <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
        {servers.map((s) => {
          const checked = set.has(s.server_id);
          return (
            <label
              key={s.server_id}
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                cursor: "pointer",
                padding: "8px 10px",
                borderRadius: "12px",
                border: "1px solid var(--color-border-subtle)",
                background: checked
                  ? "rgba(var(--color-cta-rgb), 0.1)"
                  : "rgba(var(--color-text-rgb), 0.04)",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = new Set(set);
                  if (e.currentTarget.checked) next.add(s.server_id);
                  else next.delete(s.server_id);
                  onChange(Array.from(next));
                }}
              />
              <span className="ui-code" style={{ fontWeight: 700 }}>
                {s.server_id}
              </span>
              <span className="ui-help" style={{ marginLeft: "auto" }}>
                {s.enabled ? "已启用" : "已停用"}
              </span>
            </label>
          );
        })}
        {servers.length === 0 ? <div className="ui-help">暂无 MCP。</div> : null}
      </div>
    </div>
  );
}

function normalizeServerIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean)));
}
