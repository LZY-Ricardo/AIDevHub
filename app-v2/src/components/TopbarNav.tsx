import { Icon } from "./Icon";
import { topLevelNavItems } from "../lib/pageContent";

interface TopbarNavProps {
  onMcpClick: () => void;
  onSkillClick: () => void;
}

export function TopbarNav({ onMcpClick, onSkillClick }: TopbarNavProps) {
  const handlers = {
    mcp: onMcpClick,
    skills: onSkillClick,
  };

  return (
    <nav className="ui-topbarNav">
      {topLevelNavItems
        .filter((item) => item.key === "mcp" || item.key === "skills")
        .map((item) => (
          <button
            key={item.key}
            className="ui-topbarNavItem"
            onClick={handlers[item.key]}
          >
            <Icon
              name={item.key === "skills" ? "skills" : "servers"}
              size={18}
            />
            <span>{item.label}</span>
          </button>
        ))}
    </nav>
  );
}
