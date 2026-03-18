import { useEffect, useRef, useState } from "react";
import type { RuntimeInfo, ServerRecord } from "../lib/types";
import { api } from "../lib/api";
import { clientLabel } from "../lib/format";
import { Icon } from "../components/Icon";

export function OverviewPage() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [r, s] = await Promise.all([api.runtimeGetInfo(), api.serverList()]);
      setRuntime(r);
      setServers(s);
    } catch (e) {
      setError(formatError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  const claudeTotal = servers?.filter((s) => s.client === "claude_code").length ?? 0;
  const codexTotal = servers?.filter((s) => s.client === "codex").length ?? 0;
  const claudeOn = servers?.filter((s) => s.client === "claude_code" && s.enabled).length ?? 0;
  const codexOn = servers?.filter((s) => s.client === "codex" && s.enabled).length ?? 0;

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {error ? (
        <div className="ui-error">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>加载失败</div>
              <div style={{ marginTop: "8px", color: "rgba(248, 250, 252, 0.86)" }}>{error}</div>
            </div>
            <button type="button" className="ui-btn" onClick={load}>
              <Icon name="refresh" /> 刷新
            </button>
          </div>
        </div>
      ) : null}

      <div className="ui-cardGrid">
        <div className="ui-card">
          <div className="ui-cardTitleRow">
            <h3 className="ui-cardTitle">{clientLabel("claude_code")}</h3>
            <span className="ui-pill" title="启用状态">
              <span className={`ui-pillDot ${claudeOn > 0 ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
              <span className="ui-code">
                {claudeOn}/{claudeTotal}
              </span>
            </span>
          </div>
          <div className="ui-cardBody">
            读取并管理 `~/.claude.json` 的 `mcpServers`。禁用采用禁用池策略，不丢配置。
          </div>
          <div className="ui-kpiRow">
            <PathKpi value={runtime?.paths.claude_config_path} />
            <div className="ui-kpi">
              <div className="ui-kpiLabel">是否存在</div>
              <div className="ui-kpiValue">{runtime ? String(runtime.exists.claude_config) : "—"}</div>
            </div>
            <div className="ui-kpi">
              <div className="ui-kpiLabel">启用数量</div>
              <div className="ui-kpiValue">{claudeOn}</div>
            </div>
          </div>
        </div>

        <div className="ui-card">
          <div className="ui-cardTitleRow">
            <h3 className="ui-cardTitle">{clientLabel("codex")}</h3>
            <span className="ui-pill" title="启用状态">
              <span className={`ui-pillDot ${codexOn > 0 ? "ui-pillDotOn" : "ui-pillDotOff"}`} />
              <span className="ui-code">
                {codexOn}/{codexTotal}
              </span>
            </span>
          </div>
          <div className="ui-cardBody">
            读取并管理 `~/.codex/config.toml` 的 `mcp_servers.*`。开关只改 `enabled` 字段。
          </div>
          <div className="ui-kpiRow">
            <PathKpi value={runtime?.paths.codex_config_path} />
            <div className="ui-kpi">
              <div className="ui-kpiLabel">是否存在</div>
              <div className="ui-kpiValue">{runtime ? String(runtime.exists.codex_config) : "—"}</div>
            </div>
            <div className="ui-kpi">
              <div className="ui-kpiLabel">启用数量</div>
              <div className="ui-kpiValue">{codexOn}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ui-card" style={{ gridColumn: "1 / -1" }}>
        <div className="ui-cardTitleRow">
          <h3 className="ui-cardTitle">本地数据目录</h3>
          <span className="ui-badge">Local</span>
        </div>
        <div className="ui-cardBody">
          Profiles、禁用池与备份索引都存放在 Local data dir。写入前会自动备份，可在 Backups 页面回滚。
        </div>
        <div style={{ marginTop: "14px" }}>
          <pre className="ui-pre">{JSON.stringify(runtime?.paths ?? {}, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function PathKpi({ value }: { value: string | undefined }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      // If the text is ellipsized, expose tooltip on the whole KPI card.
      setOverflow(el.scrollWidth > el.clientWidth);
    };

    update();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  const text = value ?? "—";
  const tooltip = overflow && value ? value : undefined;

  return (
    <div className="ui-kpi ui-tooltipHost" data-tooltip={tooltip} tabIndex={tooltip ? 0 : undefined}>
      <div className="ui-kpiLabel">配置文件</div>
      <div ref={ref} className="ui-kpiValue ui-code ui-ellipsis" style={{ fontSize: 12 }}>
        {text}
      </div>
    </div>
  );
}

function formatError(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as any).message);
  return JSON.stringify(e);
}
