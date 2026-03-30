import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConfigConfirmMcpRequest,
  ConfigConfirmMcpResponse,
  ConfigIgnoreCondition,
  ConfigUpdateItem,
} from "../lib/types";
import { buildConfirmMcpRequest, toIgnoreConditions } from "../lib/config-check-flow.js";
import { Dialog } from "./Dialog";
import { DiffViewer, type DiffViewMode } from "./DiffViewer";

function labelOfUpdate(update: ConfigUpdateItem): string {
  const clientLabel = update.client === "claude_code" ? "Claude Code" : "Codex";
  const kindLabel = update.kind === "mcp" ? "MCP" : "Skill";
  return `${clientLabel} / ${kindLabel}`;
}

function LazyDiffSection({
  diff,
  mode,
  wrap,
  label,
}: {
  diff: string;
  mode: DiffViewMode;
  wrap: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ display: "grid", gap: "10px", minHeight: visible ? undefined : 48 }}>
      <div className="ui-help">{label}</div>
      {visible ? <DiffViewer diff={diff} mode={mode} wrap={wrap} /> : null}
    </div>
  );
}

export function ConfigChangeDialog({
  updates,
  open,
  busy,
  onClose,
  onIgnore,
  onConfirmMcp,
}: {
  updates: ConfigUpdateItem[];
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onIgnore: (conditions: ConfigIgnoreCondition[]) => Promise<void>;
  onConfirmMcp: (request: ConfigConfirmMcpRequest) => Promise<ConfigConfirmMcpResponse>;
}) {
  const [mode, setMode] = useState<DiffViewMode>("unified");
  const [wrap, setWrap] = useState(false);

  const groupedBySource = useMemo(() => {
    const m = new Map<string, ConfigUpdateItem[]>();
    for (const item of updates) {
      const list = m.get(item.source_id) ?? [];
      list.push(item);
      m.set(item.source_id, list);
    }
    return Array.from(m.entries());
  }, [updates]);

  const ignoreConditions = useMemo<ConfigIgnoreCondition[]>(() => toIgnoreConditions(updates), [updates]);

  return (
    <Dialog
      title="检测到外部配置文件已更新"
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      footer={
        <div className="ui-btnRow">
          <button type="button" className="ui-btn" disabled={busy || updates.length === 0} onClick={() => onIgnore(ignoreConditions)}>
            忽略本次变化
          </button>
          <button type="button" className="ui-btn" disabled={busy} onClick={onClose}>
            关闭
          </button>
        </div>
      }
    >
      {updates.length === 0 ? (
        <div className="ui-help">当前没有检测到外部配置文件更新。</div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <div className="ui-help">按来源分组。MCP 可同步，Skill 仅查看。共 {groupedBySource.length} 组。</div>
            <div className="ui-tabs" role="tablist" aria-label="差异视图">
              <button type="button" className="ui-tab" role="tab" aria-selected={mode === "split"} onClick={() => setMode("split")}>
                对比视图
              </button>
              <button type="button" className="ui-tab" role="tab" aria-selected={mode === "unified"} onClick={() => setMode("unified")}>
                统一视图
              </button>
              <button type="button" className="ui-tab" role="tab" aria-selected={wrap} onClick={() => setWrap((v) => !v)}>
                自动换行
              </button>
            </div>
          </div>

          {groupedBySource.map(([sourceId, items]) => {
            const groupKind = items[0]?.kind ?? "skill";
            const groupConfirmRequest = items.find((item) => buildConfirmMcpRequest(item))
              ? buildConfirmMcpRequest(items.find((item) => buildConfirmMcpRequest(item))!)
              : null;

            return (
              <div key={sourceId} className="ui-card" style={{ padding: "16px", display: "grid", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                  <div>
                    <div className="ui-label">来源</div>
                    <div className="ui-code" style={{ marginTop: "8px", fontWeight: 700 }}>{sourceId}</div>
                  </div>
                  <div style={{ display: "grid", justifyItems: "end", gap: "8px" }}>
                    <span className="ui-badge">{items.length} 条变化</span>
                    {groupKind === "skill" ? (
                      <span className="ui-pill" title="Skill 不纳入项目内部副本，仅支持查看差异或忽略本次变化。">
                        <span className="ui-pillDot" />
                        <span className="ui-code ui-pillText">仅查看</span>
                      </span>
                    ) : groupConfirmRequest ? (
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={busy}
                        onClick={() => {
                          void onConfirmMcp(groupConfirmRequest);
                        }}
                        title="将当前外部 MCP 变化同步到项目内部副本，不会回写外部文件。"
                        >
                          同步到项目内 MCP
                        </button>
                    ) : (
                      <span className="ui-pill" title="当前 MCP 变更暂不支持同步到项目内部副本。">
                        <span className="ui-pillDot" />
                        <span className="ui-code ui-pillText">暂不支持同步</span>
                      </span>
                    )}
                  </div>
                </div>

                {items.map((item, idx) => (
                  <LazyDiffSection
                    key={`${sourceId}-${idx}`}
                    diff={item.diff_unified}
                    mode={mode}
                    wrap={wrap}
                    label={labelOfUpdate(item)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
