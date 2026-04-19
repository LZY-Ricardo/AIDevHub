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
  },
  skills: {
    title: "技能资产",
  },
  settings: {
    title: "偏好设置",
  },
};

export const dashboardContent = {
  eyebrow: "工作台",
  heroTitle: "MCP · 技能 · 备份 · 偏好",
  heroDescription: "",
  sections: {
    runtime: {
      title: "快速操作",
      description: "",
    },
    assets: {
      title: "资产总览",
      description: "",
    },
    recovery: {
      title: "恢复中心",
      description: "",
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
        tooltip: "写入到客户端配置文件",
        onClick: handlers.openWriteConfig ?? (() => {}),
      },
      {
        icon: "plus",
        label: "新增 MCP",
        tooltip: "添加 MCP 服务器",
        onClick: handlers.openAddMcp ?? (() => {}),
      },
    ];
  }

  return [];
}
