import { Icon } from "./Icon";

interface QuickActionButtonProps {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
}

export function QuickActionButton({ icon, label, onClick }: QuickActionButtonProps) {
  return (
    <button className="ui-quickActionBtn" onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}
