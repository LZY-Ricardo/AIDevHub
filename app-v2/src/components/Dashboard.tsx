import { useEffect, useState } from "react";
import { StatCard } from "./StatCard";
import { QuickActionButton } from "./QuickActionButton";
import { ActivityList } from "./ActivityList";
import type { RouteKey } from "./TopNavShell";
import type { BackupRecord, BackupOp } from "../lib/types";
import { api } from "../lib/api";
import { formatRelativeTime } from "../lib/format";
import { dashboardContent } from "../lib/pageContent";

interface Activity {
  id: string;
  time: string;
  description: string;
}

interface DashboardProps {
  onNavigate: (route: RouteKey) => void;
  onWriteConfig: () => void;
  mcpCount?: number;
  mcpActiveCount?: number;
  skillCount?: number;
  skillInstalledCount?: number;
  /** 递增此值可强制刷新最近动态 */
  refreshTrigger?: number;
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
  onWriteConfig,
  mcpCount = 0,
  mcpActiveCount = 0,
  skillCount = 0,
  skillInstalledCount = 0,
  refreshTrigger,
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
  }, [refreshTrigger]);

  const handleAddMcp = () => {
    onNavigate("mcp");
  };

  const handleInstallSkill = () => {
    onNavigate("skills");
  };

  const handleWriteConfig = () => {
    onWriteConfig();
  };

  return (
    <div className="ui-dashboard">
      <section className="ui-dashboardWelcome">
        <div className="ui-dashboardEyebrow">{dashboardContent.eyebrow}</div>
        <h1>{dashboardContent.heroTitle}</h1>
        <p className="ui-dashboardLead">{dashboardContent.heroDescription}</p>
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

      <div className="ui-dashboardGrid">
        <section
          className="ui-dashboardPanel ui-dashboardPanelWide"
          aria-label="运行工作区"
        >
          <div className="ui-cardTitleRow">
            <h2 className="ui-sectionTitle">
              {dashboardContent.sections.runtime.title}
            </h2>
          </div>
          <p className="ui-dashboardPanelIntro">
            {dashboardContent.sections.runtime.description}
          </p>
          <div className="ui-quickActionGrid">
            <QuickActionButton
              icon="plus"
              label={dashboardContent.quickActions.addMcp}
              onClick={handleAddMcp}
            />
            <QuickActionButton
              icon="download"
              label={dashboardContent.quickActions.installSkill}
              onClick={handleInstallSkill}
            />
            <QuickActionButton
              icon="save"
              label={dashboardContent.quickActions.writeConfig}
              onClick={handleWriteConfig}
            />
          </div>
        </section>

        <section className="ui-dashboardPanel" aria-label="最近动态">
          <div className="ui-cardTitleRow">
            <h2 className="ui-sectionTitle">
              {dashboardContent.sections.activity.title}
            </h2>
          </div>
          {loading ? (
            <div className="ui-activityEmpty">加载中...</div>
          ) : (
            <ActivityList activities={activities} />
          )}
        </section>

        <section
          className="ui-dashboardPanel ui-dashboardPanelWide"
          aria-label="资产与恢复"
        >
          <div className="ui-cardTitleRow">
            <h2 className="ui-sectionTitle">
              {dashboardContent.sections.assets.title}
            </h2>
          </div>
          <p className="ui-dashboardPanelIntro">
            {dashboardContent.sections.assets.description}
          </p>
        </section>

        <section className="ui-dashboardPanel" aria-label="恢复中心">
          <div className="ui-cardTitleRow">
            <h2 className="ui-sectionTitle">
              {dashboardContent.sections.recovery.title}
            </h2>
          </div>
          <p className="ui-dashboardPanelIntro">
            {dashboardContent.sections.recovery.description}
          </p>
        </section>
      </div>
    </div>
  );
}
