import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { TopbarBrand } from "./TopbarBrand";
import { TopbarNav } from "./TopbarNav";

export type RouteKey = "dashboard" | "mcp" | "skills" | "settings";

export interface TopbarAction {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
}

export interface PageHeaderInfo {
  title: string;
  kicker?: string;
  actions?: TopbarAction[];
}

interface TopNavShellProps {
  route: RouteKey;
  onNavigate: (route: RouteKey) => void;
  pageHeader?: PageHeaderInfo;
  children: ReactNode;
}

export function TopNavShell({ route, onNavigate, pageHeader, children }: TopNavShellProps) {
  const handleSettingsClick = () => {
    onNavigate("settings");
  };

  const handleMcpClick = () => {
    onNavigate("mcp");
  };

  const handleSkillClick = () => {
    onNavigate("skills");
  };

  const isDashboard = route === "dashboard";

  return (
    <div className="ui-shell">
      <header className="ui-topbar">
        {isDashboard ? (
          <>
            <TopbarBrand onSettingsClick={handleSettingsClick} />
            <TopbarNav onMcpClick={handleMcpClick} onSkillClick={handleSkillClick} />
          </>
        ) : (
          <>
            <div className="ui-topbarPageLeft">
              <button
                className="ui-backBtn"
                onClick={() => onNavigate("dashboard")}
                aria-label="返回"
              >
                <Icon name="arrowLeft" size={18} />
              </button>
              <div>
                <h1 className="ui-pageTitleBar">{pageHeader?.title ?? ""}</h1>
                {pageHeader?.kicker && (
                  <div className="ui-pageKicker">{pageHeader.kicker}</div>
                )}
              </div>
            </div>
            {pageHeader?.actions && pageHeader.actions.length > 0 && (
              <div className="ui-topbarActions">
                {pageHeader.actions.map((action) => (
                  <button
                    key={action.label}
                    className="ui-actionBtn"
                    onClick={action.onClick}
                    aria-label={action.label}
                  >
                    <Icon name={action.icon} size={18} />
                    <span className="ui-actionLabel">{action.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </header>
      <main className="ui-main">{children}</main>
    </div>
  );
}
