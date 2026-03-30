import { useEffect, useState } from "react";
import { StatCard } from "./StatCard";
import { QuickActionButton } from "./QuickActionButton";
import { ActivityList } from "./ActivityList";
import type { RouteKey } from "./TopNavShell";
import type { BackupRecord, BackupOp } from "../lib/types";
import { api } from "../lib/api";
import { formatRelativeTime } from "../lib/format";

interface Activity {
  id: string;
  time: string;
  description: string;
}

interface DashboardProps {
  onNavigate: (route: RouteKey) => void;
  mcpCount?: number;
  mcpActiveCount?: number;
  skillCount?: number;
  skillInstalledCount?: number;
}

function extractName(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function formatActivityDescription(op: BackupOp, affectedIds?: string[]): string {
  const names = (affectedIds ?? []).map(extractName);
  const nameStr = names.length > 0 ? names.join('、') : '';

  switch (op) {
    case 'toggle':
      return nameStr ? `切换了 ${nameStr}` : '切换了服务器状态';
    case 'add_server':
      return nameStr ? `添加了 ${nameStr}` : '添加了 MCP 服务器';
    case 'edit_server':
      return nameStr ? `编辑了 ${nameStr}` : '编辑了 MCP 服务器';
    case 'apply_profile':
      return '应用了配置方案';
    case 'rollback':
      return '回滚了配置';
  }
}

function backupToActivity(record: BackupRecord): Activity {
  return {
    id: record.backup_id,
    time: formatRelativeTime(record.created_at),
    description: formatActivityDescription(record.op, record.affected_ids),
  };
}

export function Dashboard({
  onNavigate,
  mcpCount = 0,
  mcpActiveCount = 0,
  skillCount = 0,
  skillInstalledCount = 0,
}: DashboardProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .backupList()
      .then((records) => {
        if (cancelled) return;
        const sorted = [...records].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setActivities(sorted.slice(0, 3).map(backupToActivity));
      })
      .catch(() => {
        if (cancelled) return;
        setActivities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        {loading ? (
          <div className="ui-activityEmpty">加载中...</div>
        ) : (
          <ActivityList activities={activities} />
        )}
      </section>
    </div>
  );
}
