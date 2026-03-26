import { StatCard } from "./StatCard";
import { QuickActionButton } from "./QuickActionButton";
import { ActivityList } from "./ActivityList";
import type { RouteKey } from "./TopNavShell";

interface DashboardProps {
  onNavigate: (route: RouteKey) => void;
  mcpCount?: number;
  mcpActiveCount?: number;
  skillCount?: number;
  skillInstalledCount?: number;
}

export function Dashboard({
  onNavigate,
  mcpCount = 0,
  mcpActiveCount = 0,
  skillCount = 0,
  skillInstalledCount = 0,
}: DashboardProps) {
  const recentActivities = [
    { id: "1", time: "2分钟前", description: "更新了 mcp-server-demo" },
    { id: "2", time: "10分钟前", description: "安装了 skill-code-reviewer" },
    { id: "3", time: "1小时前", description: "创建了备份点 v1.2.0" },
  ];

  const handleAddMcp = () => {
    onNavigate("mcp");
  };

  const handleInstallSkill = () => {
    onNavigate("skills");
  };

  const handleWriteConfig = () => {
    console.log("写入配置");
  };

  return (
    <div className="ui-dashboard">
      <section className="ui-dashboardWelcome">
        <h1>欢迎使用 AIDevHub</h1>
      </section>

      <section className="ui-dashboardStats">
        <StatCard
          title="MCP 概览"
          icon="servers"
          stats={{ total: mcpCount, active: mcpActiveCount }}
        />
        <StatCard
          title="Skill 概览"
          icon="skills"
          stats={{ total: skillCount, installed: skillInstalledCount }}
        />
      </section>

      <section className="ui-dashboardQuickActions">
        <h2 className="ui-sectionTitle">快速操作</h2>
        <div className="ui-quickActionGrid">
          <QuickActionButton icon="plus" label="添加MCP" onClick={handleAddMcp} />
          <QuickActionButton icon="download" label="安装Skill" onClick={handleInstallSkill} />
          <QuickActionButton icon="save" label="写入配置" onClick={handleWriteConfig} />
        </div>
      </section>

      <section className="ui-dashboardActivity">
        <h2 className="ui-sectionTitle">最近活动</h2>
        <ActivityList activities={recentActivities} />
      </section>
    </div>
  );
}
