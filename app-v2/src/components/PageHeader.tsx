import { Icon } from "./Icon";

export interface PageHeaderAction {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
}

interface PageHeaderProps {
  title: string;
  kicker?: string;
  actions?: PageHeaderAction[];
  onBack?: () => void;
}

export function PageHeader({ title, kicker, actions = [], onBack }: PageHeaderProps) {
  return (
    <header className="ui-pageHeaderBar">
      <div className="ui-pageHeaderLeft">
        {onBack && (
          <button className="ui-backBtn" onClick={onBack} aria-label="返回">
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        <div>
          <h1 className="ui-pageTitleBar">{title}</h1>
          {kicker && <div className="ui-pageKicker">{kicker}</div>}
        </div>
      </div>
      {actions.length > 0 && (
        <div className="ui-pageHeaderActions">
          {actions.map((action) => (
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
    </header>
  );
}
