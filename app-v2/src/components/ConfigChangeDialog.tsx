import { useMemo, useState } from "react";
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
            <div className="ui-help">按逻辑来源分组展示，共 {groupedBySource.length} 组。</div>
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

          {groupedBySource.map(([sourceId, items]) => (
            <div key={sourceId} className="ui-card" style={{ padding: "16px", display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <div>
                  <div className="ui-label">逻辑来源</div>
                  <div className="ui-code" style={{ marginTop: "8px", fontWeight: 700 }}>{sourceId}</div>
                </div>
                <div className="ui-help">{items.length} 条变化</div>
              </div>

              {items.map((item, idx) => {
                const confirmRequest = buildConfirmMcpRequest(item);
                const confirmDisabled = busy || !confirmRequest;

                return (
                  <div key={`${sourceId}-${idx}`} style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                      <div className="ui-help">{labelOfUpdate(item)}</div>
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={confirmDisabled}
                        onClick={() => {
                          if (!confirmRequest) return;
                          void onConfirmMcp(confirmRequest);
                        }}
                        title={
                          confirmDisabled
                            ? "当前变更暂不支持确认同步"
                            : "按当前逻辑来源确认更新 MCP"
                        }
                      >
                        确认更新 MCP
                      </button>
                    </div>
                    <DiffViewer diff={item.diff_unified} mode={mode} wrap={wrap} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
