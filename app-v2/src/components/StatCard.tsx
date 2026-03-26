import { Icon } from "./Icon";

interface StatCardProps {
  title: string;
  icon: Parameters<typeof Icon>[0]["name"];
  stats: {
    total?: number;
    active?: number;
    installed?: number;
  };
}

export function StatCard({ title, icon, stats }: StatCardProps) {
  const items: Array<{ label: string; value: number }> = [];

  if (stats.total !== undefined) {
    items.push({ label: "总数", value: stats.total });
  }
  if (stats.active !== undefined) {
    items.push({ label: "活跃", value: stats.active });
  }
  if (stats.installed !== undefined) {
    items.push({ label: "已安装", value: stats.installed });
  }

  return (
    <div className="ui-statCard">
      <div className="ui-statCardHeader">
        <Icon name={icon} size={20} />
        <h3 className="ui-statCardTitle">{title}</h3>
      </div>
      <div className="ui-statCardBody">
        {items.map((item) => (
          <div key={item.label} className="ui-statItem">
            <span className="ui-statLabel">{item.label}</span>
            <span className="ui-statValue">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
