import { useMemo } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type RouteKey = "servers" | "add" | "profiles" | "skills" | "backups";

const ROUTES: Array<{
  key: RouteKey;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  kicker: string;
}> = [
  { key: "servers", label: "MCP管理", icon: "servers", kicker: "开关、详情与状态" },
  { key: "add", label: "新增MCP", icon: "plus", kicker: "添加并写入配置" },
  { key: "profiles", label: "配置方案", icon: "profiles", kicker: "按方案收敛切换" },
  { key: "skills", label: "skill管理", icon: "skills", kicker: "Codex skills / Claude 命令" },
  { key: "backups", label: "备份回滚", icon: "backups", kicker: "历史记录与恢复" },
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
        <nav className="ui-nav" aria-label="主导航">
          {ROUTES.map((r) => (
            <button
              key={r.key}
              type="button"
              className="ui-navItem ui-tooltipHost"
              aria-current={r.key === route ? "page" : undefined}
              onClick={() => onNavigate(r.key)}
              data-tooltip={r.label}
            >
              <Icon name={r.icon} />
              <span className="ui-navLabel">{r.label}</span>
              {badgeByRoute?.[r.key] ? <span className="ui-badge">{badgeByRoute[r.key]}</span> : null}
            </button>
          ))}
        </nav>
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
    case "servers":
      return "MCP管理";
    case "add":
      return "新增MCP";
    case "profiles":
      return "配置方案";
    case "skills":
      return "skill管理";
    case "backups":
      return "备份回滚";
  }
}
