import { Icon } from "./Icon";

interface TopbarNavProps {
  onMcpClick: () => void;
  onSkillClick: () => void;
}

export function TopbarNav({ onMcpClick, onSkillClick }: TopbarNavProps) {
  return (
    <nav className="ui-topbarNav">
      <button className="ui-topbarNavItem" onClick={onMcpClick}>
        <Icon name="servers" size={18} />
        <span>MCP管理</span>
      </button>
      <button className="ui-topbarNavItem" onClick={onSkillClick}>
        <Icon name="skills" size={18} />
        <span>Skill管理</span>
      </button>
    </nav>
  );
}
