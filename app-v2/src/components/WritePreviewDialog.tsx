import { useMemo, useState } from "react";
import type { FilePrecondition, WritePreview } from "../lib/types";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";

function expectedFilesFromPreview(preview: WritePreview): FilePrecondition[] {
  return preview.files.map((f) => ({
    path: f.path,
    expected_before_sha256: f.before_sha256,
  }));
}

export function WritePreviewDialog({
  title,
  preview,
  open,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  preview: WritePreview | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (expectedFiles: FilePrecondition[]) => Promise<void>;
}) {
  const [tab, setTab] = useState<"summary" | "diff" | "warnings">("summary");

  const expectedFiles = useMemo(
    () => (preview ? expectedFilesFromPreview(preview) : []),
    [preview],
  );

  return (
    <Dialog
      title={title}
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      footer={
        <div className="ui-btnRow">
          <button type="button" className="ui-btn" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="ui-btn ui-btnPrimary"
            disabled={busy || !preview}
            onClick={() => onConfirm(expectedFiles)}
          >
            {busy ? "执行中..." : "确认写入"}
          </button>
        </div>
      }
    >
      {!preview ? (
        <div className="ui-error">未生成预览内容。</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
            <div className="ui-tabs" role="tablist" aria-label="预览标签">
              <button
                type="button"
                className="ui-tab"
                role="tab"
                aria-selected={tab === "summary"}
                onClick={() => setTab("summary")}
              >
                摘要
              </button>
              <button
                type="button"
                className="ui-tab"
                role="tab"
                aria-selected={tab === "diff"}
                onClick={() => setTab("diff")}
              >
                Diff
              </button>
              <button
                type="button"
                className="ui-tab"
                role="tab"
                aria-selected={tab === "warnings"}
                onClick={() => setTab("warnings")}
              >
                Warnings ({preview.warnings.length})
              </button>
            </div>

            <div className="ui-help">
              {preview.files.length} 个文件将被改写
            </div>
          </div>

          <div style={{ marginTop: "16px" }}>
            {tab === "summary" ? <SummaryView preview={preview} /> : null}
            {tab === "diff" ? <DiffView preview={preview} /> : null}
            {tab === "warnings" ? <WarningsView preview={preview} /> : null}
          </div>
        </>
      )}
    </Dialog>
  );
}

function SummaryView({ preview }: { preview: WritePreview }) {
  const { will_add, will_enable, will_disable } = preview.summary;
  return (
    <div className="ui-card" style={{ padding: "16px" }}>
      <div className="ui-kpiRow" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 0 }}>
        <div className="ui-kpi">
          <div className="ui-kpiLabel">将新增</div>
          <div className="ui-kpiValue">{will_add.length}</div>
        </div>
        <div className="ui-kpi">
          <div className="ui-kpiLabel">将启用</div>
          <div className="ui-kpiValue">{will_enable.length}</div>
        </div>
        <div className="ui-kpi">
          <div className="ui-kpiLabel">将禁用</div>
          <div className="ui-kpiValue">{will_disable.length}</div>
        </div>
      </div>

      <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
        <ServerListBlock title="Will Add" items={will_add} />
        <ServerListBlock title="Will Enable" items={will_enable} />
        <ServerListBlock title="Will Disable" items={will_disable} />
      </div>
    </div>
  );
}

function ServerListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="ui-label">{title}</div>
      {items.length === 0 ? (
        <div className="ui-help">无</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
          {items.map((s) => (
            <span key={s} className="ui-pill">
              <span className="ui-pillDot ui-pillDotOn" />
              <span className="ui-code">{s}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffView({ preview }: { preview: WritePreview }) {
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {preview.files.map((f) => (
        <div key={f.path} className="ui-card" style={{ padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
            <div className="ui-code" style={{ fontWeight: 700 }}>
              {f.path}
            </div>
            <div className="ui-help">
              {f.will_create ? "Create" : "Update"} • after {f.after_sha256.slice(0, 8)}
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <pre className="ui-pre">{f.diff_unified}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}

function WarningsView({ preview }: { preview: WritePreview }) {
  if (preview.warnings.length === 0) {
    return <div className="ui-help">无 warnings。</div>;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {preview.warnings.map((w, idx) => (
        <div
          key={`${w.code}-${idx}`}
          className="ui-card"
          style={{ padding: "16px", borderColor: "rgba(245, 158, 11, 0.25)" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "rgba(245, 158, 11, 0.95)" }}>
              <Icon name="warning" />
            </span>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{w.code}</div>
          </div>
          <div style={{ marginTop: "10px", color: "rgba(248, 250, 252, 0.86)" }}>{w.message}</div>
          {w.details ? (
            <div style={{ marginTop: "10px" }}>
              <pre className="ui-pre">{JSON.stringify(w.details, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
