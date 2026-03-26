import type { ReactNode } from "react";
import { TopbarBrand } from "./TopbarBrand";
import { TopbarNav } from "./TopbarNav";

export type RouteKey = "dashboard" | "mcp" | "skills" | "settings";

interface TopNavShellProps {
  route: RouteKey;
  onNavigate: (route: RouteKey) => void;
  children: ReactNode;
}

export function TopNavShell({ route, onNavigate, children }: TopNavShellProps) {
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
      {isDashboard ? (
        <header className="ui-topbar">
          <TopbarBrand onSettingsClick={handleSettingsClick} />
          <TopbarNav onMcpClick={handleMcpClick} onSkillClick={handleSkillClick} />
        </header>
      ) : null}
      <main className="ui-main">{children}</main>
    </div>
  );
}
