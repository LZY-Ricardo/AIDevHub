import { useEffect, useMemo, useState } from "react";
import type {
  AppError,
  Client,
  DeploymentTargetType,
  FilePrecondition,
  ManagedSkillView,
  SkillDeployment,
  SkillGetResponse,
  SkillRepoGetResponse,
  SkillRecord,
  SkillSyncEvent,
  SkillTargetProfile,
  WritePreview,
} from "../lib/types";
import { api } from "../lib/api";
import { clientLabel, enabledLabel, skillKindLabel, skillScopeLabel } from "../lib/format";
import { getProjectRootDraftError } from "../lib/projectRootValidation";
import {
  canInstallRepoSkillToTargetType,
  repoSkillInstallStatusText,
  summarizeRepoSkillInstallState,
} from "../lib/repoSkillInstallState";
import { Icon } from "../components/Icon";
import { UiSelect, type UiSelectOption } from "../components/UiSelect";
import { WritePreviewDialog } from "../components/WritePreviewDialog";

type ScopeFilter = "user" | "system" | "disabled";

type PendingAction =
  | { type: "toggle"; skill_id: string; enabled: boolean }
  | { type: "create"; client: Client; name: string; description: string; body?: string }
  | { type: "import"; client: Client; name: string; source_path: string }
  | { type: "deploy_add"; skill_id: string; target_type: DeploymentTargetType; project_root?: string }
  | { type: "deploy_remove"; deployment_id: string }
  | { type: "sync_back"; deployment_id: string }
  | { type: "redeploy"; deployment_id: string };

type ProjectRootValidation = {
  status: "idle" | "checking" | "valid" | "invalid";
  message: string | null;
  normalizedRoot?: string;
};

const IDLE_PROJECT_ROOT_VALIDATION: ProjectRootValidation = {
  status: "idle",
  message: null,
};

function formatSkillName(skillId: string): string {
  if (skillId.includes(":")) {
    return skillId.split(":").slice(1).join(":");
  }
  return skillId.replace(/^(mcp__|claudecode__|codex__|claude_code__)/, "");
}

function useProjectRootValidation(root: string) {
  const [validation, setValidation] = useState<ProjectRootValidation>(IDLE_PROJECT_ROOT_VALIDATION);

  useEffect(() => {
    const trimmed = root.trim();
    if (!trimmed) {
      setValidation(IDLE_PROJECT_ROOT_VALIDATION);
      return;
    }

    const draftError = getProjectRootDraftError(trimmed);
    if (draftError) {
      setValidation({ status: "invalid", message: draftError });
      return;
    }

    let cancelled = false;
    setValidation({ status: "checking", message: "正在校验目录..." });
    const timer = window.setTimeout(async () => {
      try {
        const normalizedRoot = await api.validateProjectRoot({ project_root: trimmed });
        if (cancelled) return;
        setValidation({
          status: "valid",
          message: "目录可用",
          normalizedRoot,
        });
      } catch (e) {
        if (cancelled) return;
        const err = e as AppError;
        setValidation({
          status: "invalid",
          message: err.message,
        });
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [root]);

  return validation;
}

export function SkillsPage() {
  const [client, setClient] = useState<Client>("claude_code");
  const [scope, setScope] = useState<ScopeFilter>("user");
  const [skills, setSkills] = useState<SkillRecord[] | null>(null);
  const [repoSkills, setRepoSkills] = useState<ManagedSkillView[] | null>(null);
  const [repoDeployments, setRepoDeployments] = useState<SkillDeployment[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<SkillRecord | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<SkillGetResponse | null>(null);
  const [repoDetailsOpen, setRepoDetailsOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<ManagedSkillView | null>(null);
  const [selectedRepoDetails, setSelectedRepoDetails] = useState<SkillRepoGetResponse | null>(null);
  const [selectedRepoDeployments, setSelectedRepoDeployments] = useState<SkillDeployment[] | null>(null);
  const [selectedRepoProfiles, setSelectedRepoProfiles] = useState<SkillTargetProfile[] | null>(null);
  const [selectedRepoEvents, setSelectedRepoEvents] = useState<SkillSyncEvent[] | null>(null);
  const [claudeProjectRoot, setClaudeProjectRoot] = useState("");
  const [codexProjectRoot, setCodexProjectRoot] = useState("");
  const claudeProjectValidation = useProjectRootValidation(claudeProjectRoot);
  const codexProjectValidation = useProjectRootValidation(codexProjectRoot);

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
      const [list, repoList, deployments] = await Promise.all([
        api.skillList({ client, scope }),
        api.skillRepoList(),
        api.skillDeploymentList(),
      ]);
      setSkills(list);
      setRepoSkills(repoList);
      setRepoDeployments(deployments);
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

  const repoDeploymentState = useMemo(() => {
    return summarizeRepoSkillInstallState(repoDeployments ?? []);
  }, [repoDeployments]);

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

  async function openRepoDetails(skill: ManagedSkillView) {
    setSelectedRepo(skill);
    setSelectedRepoDetails(null);
    setSelectedRepoDeployments(null);
    setSelectedRepoProfiles(null);
    setSelectedRepoEvents(null);
    setRepoDetailsOpen(true);
    try {
      const [full, deployments, profiles, events] = await Promise.all([
        api.skillRepoGet({ skill_id: skill.skill_id }),
        api.skillDeploymentList({ skill_id: skill.skill_id }),
        api.skillTargetProfileList(),
        api.skillSyncEventList({ skill_id: skill.skill_id }),
      ]);
      setSelectedRepoDetails(full);
      setSelectedRepoDeployments(deployments);
      setSelectedRepoProfiles(profiles);
      setSelectedRepoEvents(events);
    } catch {
      // best-effort
    }
  }

  async function chooseProjectRoot(target: "claude" | "codex") {
    setError(null);
    try {
      const current = target === "claude" ? claudeProjectRoot.trim() : codexProjectRoot.trim();
      const selected = await api.pickDirectory({ initial: current || undefined });
      if (!selected) return;
      if (target === "claude") {
        setClaudeProjectRoot(selected);
      } else {
        setCodexProjectRoot(selected);
      }
    } catch (e) {
      setError(e as AppError);
    }
  }

  async function deployRepoSkill(skillId: string, targetType: DeploymentTargetType, projectRoot?: string) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setPending({ type: "deploy_add", skill_id: skillId, target_type: targetType, project_root: projectRoot });
    setPreviewTitle(
      targetType === "claude_global"
        ? "投放到 Claude 全局"
        : targetType === "codex_global"
          ? "投放到 Codex 全局"
          : targetType === "claude_project"
            ? "投放到 Claude 项目"
            : "投放到 Codex 项目",
    );
    try {
      const preview = await api.skillDeploymentPreviewAdd({
        skill_id: skillId,
        target_type: targetType,
        project_root: projectRoot,
      });
      setPreview(preview);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function removeDeployment(deploymentId: string) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setPending({ type: "deploy_remove", deployment_id: deploymentId });
    setPreviewTitle("撤回全局投放");
    try {
      const preview = await api.skillDeploymentPreviewRemove({ deployment_id: deploymentId });
      setPreview(preview);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function checkDeployment(deploymentId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.skillDeploymentCheckOne({ deployment_id: deploymentId });
      if (selectedRepo) {
        await openRepoDetails(selectedRepo);
      } else {
        await load();
      }
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function syncBackDeployment(deploymentId: string) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setPending({ type: "sync_back", deployment_id: deploymentId });
    setPreviewTitle("从投放副本回流到仓库");
    try {
      const preview = await api.skillRepoPreviewSyncFromDeployment({ deployment_id: deploymentId });
      setPreview(preview);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function redeployOutdatedDeployment(deploymentId: string) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setPending({ type: "redeploy", deployment_id: deploymentId });
    setPreviewTitle("重新投放最新仓库版本");
    try {
      const preview = await api.skillDeploymentPreviewRedeploy({ deployment_id: deploymentId });
      setPreview(preview);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
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

  async function requestImport(s: SkillRecord) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setPending({ type: "import", client: s.client, name: formatSkillName(s.skill_id), source_path: s.container_path });
    setPreviewTitle(`导入到仓库：${formatSkillName(s.skill_id)}`);
    try {
      const p = await api.skillRepoPreviewImport({
        client: s.client,
        name: formatSkillName(s.skill_id),
        source_path: s.container_path,
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
      } else if (pending.type === "import") {
        await api.skillRepoApplyImport({
          client: pending.client,
          name: pending.name,
          source_path: pending.source_path,
          expected_files,
        });
      } else if (pending.type === "deploy_add") {
        await api.skillDeploymentApplyAdd({
          skill_id: pending.skill_id,
          target_type: pending.target_type,
          project_root: pending.project_root,
          expected_files,
        });
      } else if (pending.type === "deploy_remove") {
        await api.skillDeploymentApplyRemove({
          deployment_id: pending.deployment_id,
          expected_files,
        });
      } else if (pending.type === "sync_back") {
        await api.skillRepoApplySyncFromDeployment({
          deployment_id: pending.deployment_id,
          expected_files,
        });
      } else if (pending.type === "redeploy") {
        await api.skillDeploymentApplyRedeploy({
          deployment_id: pending.deployment_id,
          expected_files,
        });
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
      if (selectedRepo) {
        await openRepoDetails(selectedRepo);
      }
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
            <div className="ui-label">技能资产</div>
            <div className="ui-pageSummaryValue">{skills?.length ?? 0}</div>
            <div className="ui-help">本地技能总数</div>
          </div>
          <div className="ui-pageSummaryCard">
            <div className="ui-label">投放实例</div>
            <div className="ui-pageSummaryValue">{repoDeployments?.length ?? 0}</div>
            <div className="ui-help">仓库技能对应的投放副本</div>
          </div>
          <div className="ui-pageSummaryCard">
            <div className="ui-label">漂移实例</div>
            <div className="ui-pageSummaryValue">
              {(repoDeployments ?? []).filter((deployment) => deployment.status === "drifted").length}
            </div>
            <div className="ui-help">建议优先回流再重新投放</div>
          </div>
        </div>
      </section>

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

      <div className="ui-workspaceLayout">
        <section className="ui-workspaceMain">
          <div className="ui-cardTitleRow">
            <h2 className="ui-sectionTitle">本地技能</h2>
          </div>

          <div className="ui-tableWrap">
        <table className="ui-table ui-tableSkills ui-tableNoStickyLastCol" aria-label="Skills列表">
          <colgroup>
            <col className="ui-colSkillName" />
            <col className="ui-colSkillClient" />
            <col className="ui-colSkillScope" />
            <col className="ui-colSkillKind" />
            <col className="ui-colSkillStatus" />
            <col className="ui-colSkillAction" />
          </colgroup>
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
            {(filtered ?? []).map((s) => {
              const displayName = formatSkillName(s.skill_id);
              const clientText = clientLabel(s.client);
              const scopeText = skillScopeLabel(s.scope);
              const kindText = skillKindLabel(s.kind);
              const statusText = enabledLabel(s.enabled);

              return (
                <tr
                  key={s.skill_id}
                  className="ui-tr"
                  onClick={() => openDetails(s)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="ui-td">
                    <div className="ui-code ui-ellipsis ui-skillNameText" title={displayName}>
                      {displayName}
                    </div>
                  </td>
                  <td className="ui-td">
                    <div className="ui-ellipsis ui-skillClientText" title={clientText}>
                      {clientText}
                    </div>
                  </td>
                  <td className="ui-td">
                    <span className="ui-pill ui-skillMetaPill" title={scopeText}>
                      <span className="ui-pillDot" />
                      <span className="ui-code ui-ellipsis ui-pillText">{scopeText}</span>
                    </span>
                  </td>
                  <td className="ui-td">
                    <span className="ui-pill ui-skillMetaPill" title={kindText}>
                      <span className="ui-pillDot" />
                      <span className="ui-code ui-ellipsis ui-pillText">{kindText}</span>
                    </span>
                  </td>
                  <td className="ui-td">
                    <span className="ui-pill ui-skillMetaPill" title={statusText}>
                      <span className={`ui-pillDot ${s.enabled ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
                      <span className="ui-code ui-ellipsis ui-pillText">{statusText}</span>
                    </span>
                  </td>
                  <td className="ui-td ui-tableColAction" onClick={(e) => e.stopPropagation()}>
                    <div className="ui-btnRow ui-tableActionRow">
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={busy || s.scope === "system"}
                        onClick={() => requestToggle(s, !s.enabled)}
                        title={s.scope === "system" ? "系统 Skill 不支持开关" : "切换启用状态"}
                      >
                        {s.enabled ? "停用" : "启用"}
                      </button>
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={busy || s.kind !== "dir" || s.scope === "system"}
                        onClick={() => requestImport(s)}
                        title={s.kind !== "dir" ? "仅第一阶段目录型 Skill 支持导入到仓库" : "导入到内部仓库"}
                      >
                        导入仓库
                      </button>
                      <button type="button" className="ui-btn" onClick={() => openDetails(s)}>
                        详情 <Icon name="chevronRight" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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
        </section>

        <aside className="ui-workspaceSide">
          <div className="ui-sidePanelCard">
            <div className="ui-cardTitleRow">
              <h3 className="ui-sidePanelTitle">仓库技能</h3>
              <div className="ui-help">{repoSkills ? `${repoSkills.length} 个` : "加载中..."}</div>
            </div>
            <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
              {(repoSkills ?? []).map((skill) => {
                const deploymentState = repoDeploymentState.get(skill.skill_id) ?? {
                  claudeInstalled: false,
                  codexInstalled: false,
                  claudeMissing: false,
                  codexMissing: false,
                };
                const installStatus = repoSkillInstallStatusText(deploymentState);
                const hasInstalledTarget =
                  deploymentState.claudeInstalled || deploymentState.codexInstalled;

                return (
                  <div key={skill.skill_id} className="ui-timelineItem">
                    <div className="ui-timelineTitle">{skill.display_name}</div>
                    <div className="ui-help" style={{ marginTop: "6px" }}>
                      v{skill.version} · {installStatus}
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                      <span className="ui-pill ui-skillMetaPill" title={installStatus}>
                        <span
                          className={`ui-pillDot ${hasInstalledTarget ? "ui-pillDotOn" : "ui-pillDotOff"}`}
                        />
                        <span className="ui-code ui-ellipsis ui-pillText">{installStatus}</span>
                      </span>
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={busy}
                        onClick={() => openRepoDetails(skill)}
                      >
                        查看详情
                      </button>
                    </div>
                  </div>
                );
              })}
              {repoSkills && repoSkills.length === 0 ? (
                <div className="ui-help">仓库中还没有 Skill。</div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <DetailsDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        basic={selected}
        full={selectedDetails}
      />

      <RepoDetailsDrawer
        open={repoDetailsOpen}
        onClose={() => setRepoDetailsOpen(false)}
        basic={selectedRepo}
        full={selectedRepoDetails}
        deployments={selectedRepoDeployments}
        deploymentState={
          selectedRepo
            ? repoDeploymentState.get(selectedRepo.skill_id) ?? {
                claudeInstalled: false,
                codexInstalled: false,
                claudeMissing: false,
                codexMissing: false,
              }
            : {
                claudeInstalled: false,
                codexInstalled: false,
                claudeMissing: false,
                codexMissing: false,
              }
        }
        targetProfiles={selectedRepoProfiles}
        syncEvents={selectedRepoEvents}
        busy={busy}
        onDeploy={deployRepoSkill}
        onRemoveDeployment={removeDeployment}
        onCheckDeployment={checkDeployment}
        onSyncBack={syncBackDeployment}
        onRedeploy={redeployOutdatedDeployment}
        claudeProjectRoot={claudeProjectRoot}
        codexProjectRoot={codexProjectRoot}
        claudeProjectValidation={claudeProjectValidation}
        codexProjectValidation={codexProjectValidation}
        setClaudeProjectRoot={setClaudeProjectRoot}
        setCodexProjectRoot={setCodexProjectRoot}
        onPickProjectRoot={chooseProjectRoot}
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

function RepoDetailsDrawer({
  open,
  onClose,
  basic,
  full,
  deployments,
  deploymentState,
  targetProfiles,
  syncEvents,
  busy,
  onDeploy,
  onRemoveDeployment,
  onCheckDeployment,
  onSyncBack,
  onRedeploy,
  claudeProjectRoot,
  codexProjectRoot,
  claudeProjectValidation,
  codexProjectValidation,
  setClaudeProjectRoot,
  setCodexProjectRoot,
  onPickProjectRoot,
}: {
  open: boolean;
  onClose: () => void;
  basic: ManagedSkillView | null;
  full: SkillRepoGetResponse | null;
  deployments: SkillDeployment[] | null;
  deploymentState: {
    claudeInstalled: boolean;
    codexInstalled: boolean;
    claudeMissing: boolean;
    codexMissing: boolean;
  };
  targetProfiles: SkillTargetProfile[] | null;
  syncEvents: SkillSyncEvent[] | null;
  busy: boolean;
  onDeploy: (skillId: string, targetType: DeploymentTargetType, projectRoot?: string) => Promise<void>;
  onRemoveDeployment: (deploymentId: string) => Promise<void>;
  onCheckDeployment: (deploymentId: string) => Promise<void>;
  onSyncBack: (deploymentId: string) => Promise<void>;
  onRedeploy: (deploymentId: string) => Promise<void>;
  claudeProjectRoot: string;
  codexProjectRoot: string;
  claudeProjectValidation: ProjectRootValidation;
  codexProjectValidation: ProjectRootValidation;
  setClaudeProjectRoot: (value: string) => void;
  setCodexProjectRoot: (value: string) => void;
  onPickProjectRoot: (target: "claude" | "codex") => Promise<void>;
}) {
  if (!open) return null;
  return (
    <div
      className="ui-dialogOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="仓库Skill详情"
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
          <div className="ui-dialogTitleWrap">
            <div className="ui-dialogEyebrow">Asset Detail</div>
            <div className="ui-dialogTitle">仓库 Skill 详情</div>
          </div>
          <button type="button" className="ui-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="ui-dialogBody">
          <div style={{ display: "grid", gap: "12px" }}>
            <div className="ui-pageSummaryCard ui-dialogSummaryCard">
              <div className="ui-label">名称</div>
              <div className="ui-code" style={{ marginTop: "8px", fontWeight: 700 }}>
                {full?.manifest.display_name ?? basic?.display_name ?? "（未加载）"}
              </div>
              <div className="ui-label" style={{ marginTop: "14px" }}>
                描述
              </div>
              <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>
                {full?.manifest.description ?? basic?.description ?? "（无）"}
              </div>
            </div>

            <div className="ui-dialogSectionCard">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div className="ui-label">投放</div>
                <div className="ui-btnRow">
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={busy || !basic || !canInstallRepoSkillToTargetType(deploymentState, "claude_global")}
                    onClick={() => basic && onDeploy(basic.skill_id, "claude_global")}
                    title={
                      canInstallRepoSkillToTargetType(deploymentState, "claude_global")
                        ? "安装到 Claude 全局目录"
                        : "已经安装到 Claude 全局目录"
                    }
                  >
                    投放到 Claude 全局
                  </button>
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={busy || !basic || !canInstallRepoSkillToTargetType(deploymentState, "codex_global")}
                    onClick={() => basic && onDeploy(basic.skill_id, "codex_global")}
                    title={
                      canInstallRepoSkillToTargetType(deploymentState, "codex_global")
                        ? "安装到 Codex 全局目录"
                        : "已经安装到 Codex 全局目录"
                    }
                  >
                    投放到 Codex 全局
                  </button>
                </div>
              </div>
              <div className="ui-formGrid" style={{ marginTop: "12px" }}>
                {targetProfiles && targetProfiles.length > 0 ? (
                  <div className="ui-field ui-fieldFull">
                    <div className="ui-label">已保存目标</div>
                    <div className="ui-btnRow" style={{ marginTop: "10px", flexWrap: "wrap" }}>
                      {targetProfiles.map((profile) => (
                        <button
                          key={profile.target_profile_id}
                          type="button"
                          className="ui-btn"
                          disabled={busy || !canInstallRepoSkillToTargetType(deploymentState, profile.target_type)}
                          onClick={() => basic && onDeploy(basic.skill_id, profile.target_type, profile.project_root)}
                          title={profile.target_root}
                        >
                          {profile.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="ui-field ui-fieldFull">
                  <div className="ui-label">Claude 项目目录</div>
                  <input
                    className="ui-input"
                    placeholder="例如 F:/myProjects/demo"
                    value={claudeProjectRoot}
                    onChange={(e) => setClaudeProjectRoot(e.currentTarget.value)}
                    disabled={busy}
                  />
                  <div className="ui-btnRow" style={{ marginTop: "10px" }}>
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={busy}
                      onClick={() => onPickProjectRoot("claude")}
                    >
                      选择目录
                    </button>
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={busy || !basic || claudeProjectValidation.status !== "valid"}
                      onClick={() => basic && onDeploy(basic.skill_id, "claude_project", claudeProjectRoot.trim())}
                    >
                      投放到 Claude 项目
                    </button>
                  </div>
                  <ProjectRootFeedback
                    validation={claudeProjectValidation}
                    targetRootSuffix=".claude/skills"
                  />
                </div>
                <div className="ui-field ui-fieldFull">
                  <div className="ui-label">Codex 项目目录</div>
                  <input
                    className="ui-input"
                    placeholder="例如 F:/myProjects/demo"
                    value={codexProjectRoot}
                    onChange={(e) => setCodexProjectRoot(e.currentTarget.value)}
                    disabled={busy}
                  />
                  <div className="ui-btnRow" style={{ marginTop: "10px" }}>
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={busy}
                      onClick={() => onPickProjectRoot("codex")}
                    >
                      选择目录
                    </button>
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={busy || !basic || codexProjectValidation.status !== "valid"}
                      onClick={() => basic && onDeploy(basic.skill_id, "codex_project", codexProjectRoot.trim())}
                    >
                      投放到 Codex 项目
                    </button>
                  </div>
                  <ProjectRootFeedback
                    validation={codexProjectValidation}
                    targetRootSuffix=".codex/skills"
                  />
                </div>
              </div>
              <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                {(deployments ?? []).map((deployment) => (
                  <div key={deployment.deployment_id} className="ui-card" style={{ padding: "12px" }}>
                    <div className="ui-code">{deployment.target_type}</div>
                    {deployment.project_root ? (
                      <div className="ui-help" style={{ marginTop: "6px" }}>
                        项目：{deployment.project_root}
                      </div>
                    ) : null}
                    <div className="ui-help" style={{ marginTop: "6px" }}>
                      {deployment.target_skill_path}
                    </div>
                    <div className="ui-help" style={{ marginTop: "6px" }}>
                      状态：{deployment.status}
                    </div>
                    <div className="ui-btnRow" style={{ marginTop: "10px" }}>
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={busy}
                        onClick={() => onCheckDeployment(deployment.deployment_id)}
                      >
                        检查状态
                      </button>
                      {deployment.status === "drifted" ? (
                        <button
                          type="button"
                          className="ui-btn"
                          disabled={busy}
                          onClick={() => onSyncBack(deployment.deployment_id)}
                        >
                          回流到仓库
                        </button>
                      ) : null}
                      {deployment.status === "outdated" ? (
                        <button
                          type="button"
                          className="ui-btn"
                          disabled={busy}
                          onClick={() => onRedeploy(deployment.deployment_id)}
                        >
                          重新投放
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={busy || deployment.status === "disabled"}
                        onClick={() => onRemoveDeployment(deployment.deployment_id)}
                      >
                        撤回
                      </button>
                    </div>
                  </div>
                ))}
                {deployments && deployments.length === 0 ? <div className="ui-help">暂无投放。</div> : null}
              </div>
            </div>

            <div className="ui-dialogSectionCard">
              <div className="ui-label">仓库目录</div>
              <div className="ui-code" style={{ marginTop: "8px" }}>
                {full?.manifest.repo_root ?? "（未加载）"}
              </div>
              {full?.manifest.source_detail.imported_from_path ? (
                <>
                  <div className="ui-label" style={{ marginTop: "14px" }}>
                    导入来源
                  </div>
                  <div className="ui-code" style={{ marginTop: "8px" }}>
                    {full.manifest.source_detail.imported_from_path}
                  </div>
                </>
              ) : null}
              <div className="ui-label" style={{ marginTop: "14px" }}>
                内容（只读）
              </div>
              <div style={{ marginTop: "10px" }}>
                <pre className="ui-pre">{full?.content ?? "（未加载）"}</pre>
              </div>
            </div>

            <div className="ui-card" style={{ padding: "16px" }}>
              <div className="ui-label">同步事件</div>
              <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                {(syncEvents ?? []).map((event) => (
                  <div key={event.event_id} className="ui-card" style={{ padding: "12px" }}>
                    <div className="ui-code">{event.event_type}</div>
                    <div className="ui-help" style={{ marginTop: "6px" }}>
                      {event.message}
                    </div>
                  </div>
                ))}
                {syncEvents && syncEvents.length === 0 ? <div className="ui-help">暂无同步事件。</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectRootFeedback({
  validation,
  targetRootSuffix,
}: {
  validation: ProjectRootValidation;
  targetRootSuffix: string;
}) {
  if (validation.status === "idle" || !validation.message) return null;

  const content =
    validation.status === "valid" && validation.normalizedRoot
      ? `${validation.message} · ${validation.normalizedRoot}/${targetRootSuffix}`
      : validation.message;

  if (validation.status === "invalid") {
    return (
      <div className="ui-error" style={{ marginTop: "10px", padding: "10px 12px" }}>
        {content}
      </div>
    );
  }

  return (
    <div className="ui-help" style={{ marginTop: "10px" }}>
      {content}
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
          <div className="ui-dialogTitleWrap">
            <div className="ui-dialogEyebrow">Skill Detail</div>
            <div className="ui-dialogTitle">Skill 详情</div>
          </div>
          <button type="button" className="ui-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="ui-dialogBody">
          {!rec ? (
            <div className="ui-help">无内容</div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              <div className="ui-pageSummaryCard ui-dialogSummaryCard">
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

            <div className="ui-dialogSectionCard">
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
