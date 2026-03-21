import type { ServerNotes, ServerRecord } from "./types";

export interface ExplainedServerField {
  key: string;
  value: unknown;
  display_value: string;
  hint: string;
}

export interface ExplainedServerDetails {
  description: string;
  fields: ExplainedServerField[];
}

const KNOWN_SERVER_DESCRIPTIONS: Record<string, string> = {
  neon: "用于连接和管理 Neon 数据库能力，例如查询、分支、迁移和调优。",
  brightdata: "用于执行网页搜索、抓取和结构化内容提取。",
  playwright: "用于浏览器自动化操作，例如打开页面、点击、截图和表单交互。",
  "chrome-devtools": "用于浏览器调试能力，例如查看 DOM、网络请求和控制台信息。",
  context7: "用于查询常见库和框架的文档内容，帮助补充技术说明。",
};

const KNOWN_FIELD_HINTS: Record<string, string> = {
  command: "启动本地 MCP 服务的命令。",
  args: "传给启动命令的参数。",
  url: "连接远程 MCP 服务的地址。",
  env: "运行该 MCP 所需的环境变量。",
  headers: "连接远程服务时附带的请求头，通常用于认证。",
  enabled: "标记当前 MCP 是否启用。",
  type: "声明 MCP 的连接方式或服务类型。",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function explainDescription(server: ServerRecord): string {
  const known = KNOWN_SERVER_DESCRIPTIONS[normalizeKey(server.name)];
  if (known) return known;

  if (server.transport === "http" && typeof server.payload.url === "string") {
    return "用于通过远程 HTTP MCP 服务提供外部能力接入。";
  }
  if (server.transport === "stdio" && typeof server.payload.command === "string") {
    return "用于通过本地命令启动 MCP 服务并接入外部能力。";
  }
  return "用于为客户端提供可调用的 MCP 能力，当前暂无更具体的内置说明。";
}

function formatScalar(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.every((item) => ["string", "number", "boolean"].includes(typeof item))
      ? value.map((item) => String(item)).join(", ")
      : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function explainFieldHint(key: string): string {
  return KNOWN_FIELD_HINTS[normalizeKey(key)] ?? "该项来自 MCP 原始配置，当前暂无内置说明。";
}

export function explainServerDetails(server: ServerRecord, notes: ServerNotes): ExplainedServerDetails {
  const description = notes.description.trim() || explainDescription(server);
  const fields = Object.entries(server.payload).map(([key, value]) => ({
    key,
    value,
    display_value: formatScalar(value),
    hint: notes.field_hints[key]?.trim() || explainFieldHint(key),
  }));

  return {
    description,
    fields,
  };
}
