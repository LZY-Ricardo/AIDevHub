import type { TopbarAction, RouteKey } from "../components/TopNavShell";

export const topLevelNavItems = [
  { key: "dashboard", label: "总览" },
  { key: "mcp", label: "MCP" },
  { key: "skills", label: "Skills" },
  { key: "settings", label: "偏好" },
] satisfies Array<{ key: RouteKey; label: string }>;

export const pageHeaderContent: Partial<
  Record<RouteKey, { title: string; kicker?: string }>
> = {
  mcp: {
    title: "MCP 管理",
    kicker: "先看健康、漂移和写入准备度，再进入配置详情。",
  },
  skills: {
    title: "技能资产",
    kicker: "统一管理本地技能、仓库技能和投放实例。",
  },
  settings: {
    title: "偏好设置",
    kicker: "集中管理差异展示、界面密度和风险反馈。",
  },
};

export const dashboardContent = {
  eyebrow: "精准工作台",
  heroTitle: "统一管理 MCP 运行、技能资产、备份恢复与系统偏好。",
  heroDescription:
    "在打开详情侧板之前，先看见健康状态、配置漂移、回滚准备度和部署状态。",
  sections: {
    runtime: {
      title: "运行工作区",
      description: "MCP 主工作区强调快速检测、受控编辑与可预览写入。",
    },
    assets: {
      title: "资产与恢复",
      description:
        "技能与备份历史被组织成关联资产，可统一投放、核验、回滚与回流。",
    },
    recovery: {
      title: "恢复中心",
      description: "备份不是埋在深处的历史记录，而是显性的安全层。",
    },
    activity: {
      title: "最近动态",
    },
  },
  quickActions: {
    addMcp: "新增 MCP",
    installSkill: "安装技能",
    writeConfig: "写入配置",
  },
} as const;

export function buildPageHeaderActions(route: RouteKey, handlers: {
  openWriteConfig?: () => void;
  openAddMcp?: () => void;
}): TopbarAction[] {
  if (route === "mcp") {
    return [
      {
        icon: "save",
        label: "写入配置",
        tooltip: "将项目内部维护的 MCP 配置信息写入本机客户端配置文件",
        onClick: handlers.openWriteConfig ?? (() => {}),
      },
      {
        icon: "plus",
        label: "新增 MCP",
        tooltip: "添加新的 MCP 服务器到项目内部配置",
        onClick: handlers.openAddMcp ?? (() => {}),
      },
    ];
  }

  return [];
}
