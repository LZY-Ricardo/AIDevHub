import { useMemo } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type RouteKey = "overview" | "servers" | "add" | "profiles" | "backups";

const ROUTES: Array<{
  key: RouteKey;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  kicker: string;
}> = [
  { key: "overview", label: "总览", icon: "dashboard", kicker: "路径与状态概览" },
  { key: "servers", label: "Servers", icon: "servers", kicker: "开关与详情" },
  { key: "add", label: "Add Server", icon: "plus", kicker: "新增并启用" },
  { key: "profiles", label: "Profiles", icon: "profiles", kicker: "收敛式切换" },
  { key: "backups", label: "Backups", icon: "backups", kicker: "回滚历史" },
];

export function AppShell({
  route,
  onNavigate,
  badgeByRoute,
  children,
}: {
  route: RouteKey;
  onNavigate: (r: RouteKey) => void;
  badgeByRoute?: Partial<Record<RouteKey, string>>;
  children: ReactNode;
}) {
  const kicker = useMemo(() => ROUTES.find((r) => r.key === route)?.kicker ?? "", [route]);

  return (
    <div className="ui-shell">
      <aside className="ui-sidebar">
        <div className="ui-brand">
          <div className="ui-brandMark" aria-hidden="true" />
          <div>
            <div className="ui-brandTitle">AIDevHub</div>
            <div className="ui-brandSub">MCP 配置中控台 (MVP)</div>
          </div>
        </div>

        <nav className="ui-nav" aria-label="主导航">
          {ROUTES.map((r) => (
            <button
              key={r.key}
              type="button"
              className="ui-navItem"
              aria-current={r.key === route ? "page" : undefined}
              onClick={() => onNavigate(r.key)}
              title={r.label}
            >
              <Icon name={r.icon} />
              <span className="ui-navLabel">{r.label}</span>
              {badgeByRoute?.[r.key] ? <span className="ui-badge">{badgeByRoute[r.key]}</span> : null}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: "auto", paddingTop: "16px" }}>
          <div className="ui-help">
            所有写入操作都将先 preview diff，再 apply 并备份。
          </div>
        </div>
      </aside>

      <main className="ui-main">
        <div className="ui-pageHeader">
          <div>
            <h1 className="ui-pageTitle">{pageTitle(route)}</h1>
            <div className="ui-pageKicker">{kicker}</div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function pageTitle(route: RouteKey): string {
  switch (route) {
    case "overview":
      return "总览";
    case "servers":
      return "Servers";
    case "add":
      return "Add Server";
    case "profiles":
      return "Profiles";
    case "backups":
      return "Backups / Rollback";
  }
}
