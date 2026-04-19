import type { McpRegistryExternalDiff } from "../lib/types";
import { Dialog } from "./Dialog";

export function McpConfigDiffSummaryDialog({
  diff,
  open,
  busy,
  onClose,
  onViewDiff,
}: {
  diff: McpRegistryExternalDiff | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onViewDiff: () => void;
}) {
  return (
    <Dialog
      title="项目内 MCP 与本地差异摘要"
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      footer={
        <div className="ui-btnRow">
          {diff?.has_diff ? (
            <button type="button" className="ui-btn ui-btnPrimary" disabled={busy} onClick={onViewDiff}>
              查看差异
            </button>
          ) : null}
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
            <div className="ui-help">当前客户端</div>
            <div className="ui-code">{diff.client}</div>
            <div className="ui-help">本地目标</div>
            <div className="ui-code">{diff.target_path}</div>
          </div>
          <div className={diff.has_diff ? "ui-help" : "ui-card"} style={diff.has_diff ? undefined : { padding: "16px" }}>
            {diff.has_diff ? "检测到项目内 MCP 与本地配置存在差异。" : "当前没有发现差异。"}
          </div>
        </div>
      )}
    </Dialog>
  );
}
