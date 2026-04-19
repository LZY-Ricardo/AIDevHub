import { Icon } from "./Icon";

interface TopbarBrandProps {
  onSettingsClick: () => void;
}

export function TopbarBrand({ onSettingsClick }: TopbarBrandProps) {
  return (
    <div className="ui-topbarBrand">
      <div className="ui-brandBlock">
        <h1 className="ui-brandName">AIDevHub</h1>
        <div className="ui-brandTag">精准工作台</div>
      </div>
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
