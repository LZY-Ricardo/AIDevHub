import { Icon } from "./Icon";

interface TopbarBrandProps {
  onSettingsClick: () => void;
}

export function TopbarBrand({ onSettingsClick }: TopbarBrandProps) {
  return (
    <div className="ui-topbarBrand">
      <h1 className="ui-brandName">AIDevHub</h1>
      <button
        className="ui-iconBtn"
        onClick={onSettingsClick}
        aria-label="设置"
      >
        <Icon name="settings" size={18} />
      </button>
    </div>
  );
}
