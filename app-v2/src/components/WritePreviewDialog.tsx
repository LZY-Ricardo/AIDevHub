import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { FilePrecondition, WritePreview } from "../lib/types";
import { Dialog } from "./Dialog";
import { DiffViewer, type DiffViewMode } from "./DiffViewer";
import { Icon } from "./Icon";

function expectedFilesFromPreview(preview: WritePreview): FilePrecondition[] {
  if (preview.expected_files && preview.expected_files.length) {
    return preview.expected_files;
  }
  return preview.files.map((f) => ({
    path: f.path,
    expected_before_sha256: f.before_sha256,
  }));
}

export const WritePreviewDialog = memo(function WritePreviewDialog({
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
  const [tab, setTab] = useState<"summary" | "diff" | "moves" | "warnings">("summary");

  const expectedFiles = useMemo(
    () => (preview ? expectedFilesFromPreview(preview) : []),
    [preview],
  );

  const moveCount = preview?.moves?.length ?? 0;

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
          <div className="ui-pageSummaryCard ui-dialogSummaryCard">
            <div className="ui-label">预览概览</div>
            <div className="ui-pageSummaryValue">{preview.files.length}</div>
            <div className="ui-help">
              个文件将被改写{moveCount ? `，${moveCount} 个路径将被移动` : ""}
            </div>
          </div>

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
                差异
              </button>
              <button
                type="button"
                className="ui-tab"
                role="tab"
                aria-selected={tab === "moves"}
                onClick={() => setTab("moves")}
              >
                移动 ({moveCount})
              </button>
              <button
                type="button"
                className="ui-tab"
                role="tab"
                aria-selected={tab === "warnings"}
                onClick={() => setTab("warnings")}
              >
                风险提示 ({preview.warnings.length})
              </button>
            </div>

            <div className="ui-help">写入前需预览确认。</div>
          </div>

          <div style={{ marginTop: "16px" }}>
            {tab === "summary" ? <SummaryView preview={preview} /> : null}
            {tab === "diff" ? <DiffView preview={preview} /> : null}
            {tab === "moves" ? <MovesView preview={preview} /> : null}
            {tab === "warnings" ? <WarningsView preview={preview} /> : null}
          </div>
        </>
      )}
    </Dialog>
  );
});

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

      <div className="ui-dialogSectionGrid">
        <ServerListBlock title="将新增" items={will_add} />
        <ServerListBlock title="将启用" items={will_enable} />
        <ServerListBlock title="将停用" items={will_disable} />
      </div>
    </div>
  );
}

function ServerListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="ui-dialogSectionCard">
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

function LazyFileDiffCard({
  path,
  diffUnified,
  willCreate,
  afterSha256,
  mode,
  wrap,
}: {
  path: string;
  diffUnified: string;
  willCreate: boolean;
  afterSha256: string;
  mode: DiffViewMode;
  wrap: boolean;
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
    <div ref={ref} className="ui-card" style={{ padding: "16px", minHeight: visible ? undefined : 48 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
        <div className="ui-code" style={{ fontWeight: 700 }}>
          {path}
        </div>
        <div className="ui-help">
          {willCreate ? "新建" : "更新"} • 变更后 {afterSha256.slice(0, 8)}
        </div>
      </div>
      {visible ? (
        <div style={{ marginTop: "12px" }}>
          <DiffViewer diff={diffUnified} mode={mode} wrap={wrap} />
        </div>
      ) : null}
    </div>
  );
}

function DiffView({ preview }: { preview: WritePreview }) {
  const [mode, setMode] = useState<DiffViewMode>("split");
  const [wrap, setWrap] = useState(false);
  if (preview.files.length === 0) {
    return <div className="ui-help">无文件差异。</div>;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
        <div className="ui-tabs" role="tablist" aria-label="差异视图">
          <button
            type="button"
            className="ui-tab"
            role="tab"
            aria-selected={mode === "split"}
            onClick={() => setMode("split")}
          >
            对比视图
          </button>
          <button
            type="button"
            className="ui-tab"
            role="tab"
            aria-selected={mode === "unified"}
            onClick={() => setMode("unified")}
          >
            统一视图
          </button>
          <button
            type="button"
            className="ui-tab"
            role="tab"
            aria-selected={wrap}
            onClick={() => setWrap((v) => !v)}
          >
            自动换行
          </button>
        </div>

        <div className="ui-help">基于 unified diff，上下文 3 行。</div>
      </div>

      {preview.files.map((f) => (
        <LazyFileDiffCard
          key={f.path}
          path={f.path}
          diffUnified={f.diff_unified}
          willCreate={f.will_create}
          afterSha256={f.after_sha256}
          mode={mode}
          wrap={wrap}
        />
      ))}
    </div>
  );
}

function MovesView({ preview }: { preview: WritePreview }) {
  const moves = preview.moves ?? [];
  if (moves.length === 0) {
    return <div className="ui-help">无移动操作。</div>;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {moves.map((m, idx) => (
        <div key={`${m.from}-${m.to}-${idx}`} className="ui-dialogSectionCard">
          <div className="ui-label">移动（{m.kind === "dir" ? "目录" : "文件"}）</div>
          <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
            <div className="ui-code">{m.from}</div>
            <div className="ui-help">→</div>
            <div className="ui-code">{m.to}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WarningsView({ preview }: { preview: WritePreview }) {
  if (preview.warnings.length === 0) {
    return <div className="ui-help">无风险提示。</div>;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {preview.warnings.map((w, idx) => (
        <div
          key={`${w.code}-${idx}`}
          className="ui-dialogSectionCard"
          style={{ borderColor: "rgba(245, 158, 11, 0.25)" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "rgba(245, 158, 11, 0.95)" }}>
              <Icon name="warning" />
            </span>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{w.code}</div>
          </div>
          <div style={{ marginTop: "10px", color: "var(--color-muted)" }}>{w.message}</div>
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
