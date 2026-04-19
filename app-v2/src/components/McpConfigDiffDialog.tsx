import { useEffect, useState } from "react";
import type { McpRegistryExternalDiff } from "../lib/types";
import { Dialog } from "./Dialog";
import { DiffViewer, type DiffViewMode } from "./DiffViewer";

export function McpConfigDiffDialog({
  diff,
  open,
  busy,
  onClose,
}: {
  diff: McpRegistryExternalDiff | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<DiffViewMode>("unified");
  const [wrap, setWrap] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("unified");
    setWrap(false);
  }, [open, diff?.client, diff?.diff_unified]);

  return (
    <Dialog
      title="配置差异"
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      footer={
        <div className="ui-btnRow">
          <button type="button" className="ui-btn" disabled={busy} onClick={onClose}>
            关闭
          </button>
        </div>
      }
    >
      {!diff ? (
        <div className="ui-help">暂无差异结果。</div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          <div className="ui-pageSummaryCard ui-dialogSummaryCard">
            <div className="ui-label">差异状态</div>
            <div className="ui-pageSummaryValue">{diff.has_diff ? "存在差异" : "已同步"}</div>
            <div className="ui-help">客户端：{diff.client}</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
            <div className="ui-help">
              客户端：<span className="ui-code">{diff.client}</span>
            </div>
            <div className="ui-tabs" role="tablist" aria-label="差异视图">
              <button type="button" className="ui-tab" role="tab" aria-selected={mode === "split"} onClick={() => setMode("split")}>
                对比视图
              </button>
              <button type="button" className="ui-tab" role="tab" aria-selected={mode === "unified"} onClick={() => setMode("unified")}>
                统一视图
              </button>
              <button type="button" className="ui-tab" role="tab" aria-selected={wrap} onClick={() => setWrap((value) => !value)}>
                自动换行
              </button>
            </div>
          </div>

          <div className="ui-card" style={{ padding: "16px", display: "grid", gap: "8px" }}>
            <div className="ui-help">本地目标</div>
            <div className="ui-code">{diff.target_path}</div>
          </div>

          {diff.has_diff ? (
            <DiffViewer diff={diff.diff_unified} mode={mode} wrap={wrap} />
          ) : (
            <div className="ui-help">配置已同步，无差异。</div>
          )}
        </div>
      )}
    </Dialog>
  );
}
