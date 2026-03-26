import { useEffect, useState } from "react";
import type { AppError, AppSettings, McpDiffCheckMode } from "../lib/types";

const MODE_OPTIONS: Array<{
  value: McpDiffCheckMode;
  label: string;
  help: string;
}> = [
  {
    value: "open_diff",
    label: "open_diff",
    help: "发现 MCP 差异后直接打开完整 diff，适合逐条核对变更。",
  },
  {
    value: "summary_only",
    label: "summary_only",
    help: "仅展示摘要，减少打断；需要时再进入详细内容。",
  },
];

export function SettingsPage({
  settings,
  busy = false,
  error = null,
  onSave,
}: {
  settings: AppSettings | null;
  busy?: boolean;
  error?: AppError | null;
  onSave: (next: AppSettings) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<McpDiffCheckMode>("open_diff");

  useEffect(() => {
    if (!settings) return;
    setMode(settings.mcp_diff_check_mode);
  }, [settings]);

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <section className="ui-card" style={{ padding: "16px" }}>
        <div className="ui-label">MCP 差异检测结果展示方式</div>
        <div className="ui-help" style={{ marginTop: "8px" }}>
          这里只控制差异检测结果的默认展示偏好，不扩展额外流程状态。
        </div>

        <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="ui-card"
              style={{
                padding: "12px 14px",
                display: "grid",
                gap: "6px",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <input
                  type="radio"
                  name="mcp_diff_check_mode"
                  value={option.value}
                  checked={mode === option.value}
                  disabled={busy || !settings}
                  onChange={() => setMode(option.value)}
                />
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{option.label}</span>
              </div>
              <div className="ui-help">{option.help}</div>
            </label>
          ))}
        </div>

        <div className="ui-btnRow" style={{ marginTop: "16px" }}>
          <button
            type="button"
            className="ui-btn ui-btnPrimary"
            disabled={busy || !settings}
            onClick={() => onSave({ mcp_diff_check_mode: mode })}
          >
            保存设置
          </button>
        </div>

        {error ? (
          <div className="ui-error" style={{ marginTop: "16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{error.code}</div>
            <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{error.message}</div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
