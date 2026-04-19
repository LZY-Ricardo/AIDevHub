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
  summary_fields: ExplainedServerField[];
  hidden_field_count: number;
}

const KNOWN_SERVER_DESCRIPTIONS: Record<string, string> = {
  neon: "Neon 数据库连接、查询与迁移。",
  brightdata: "网页搜索、抓取与内容提取。",
  playwright: "浏览器自动化：页面交互、截图与表单操作。",
  "chrome-devtools": "浏览器调试：DOM 检查、网络请求与控制台。",
  context7: "查询常见库与框架的最新文档。",
};

const KNOWN_FIELD_HINTS: Record<string, string> = {
  command: "本地启动命令。",
  args: "启动命令的参数。",
  url: "远程 MCP 服务地址。",
  env: "运行所需的环境变量。",
  headers: "远程请求头（通常用于认证）。",
  enabled: "是否启用当前 MCP。",
  type: "连接方式或服务类型。",
};

const SUMMARY_FIELD_PRIORITY = ["type", "url", "command", "args", "headers", "env", "enabled"];
const DEFAULT_SUMMARY_FIELD_LIMIT = 3;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function explainDescription(server: ServerRecord): string {
  const known = KNOWN_SERVER_DESCRIPTIONS[normalizeKey(server.name)];
  if (known) return known;

  if (server.transport === "http" && typeof server.payload.url === "string") {
    return "通过 HTTP 接入远程 MCP 服务。";
  }
  if (server.transport === "stdio" && typeof server.payload.command === "string") {
    return "通过本地命令启动 MCP 服务。";
  }
  return "MCP 能力服务。";
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
  return KNOWN_FIELD_HINTS[normalizeKey(key)] ?? "MCP 原始配置字段。";
}

function sortSummaryFields(fields: ExplainedServerField[]): ExplainedServerField[] {
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const leftRank = SUMMARY_FIELD_PRIORITY.indexOf(normalizeKey(left.field.key));
      const rightRank = SUMMARY_FIELD_PRIORITY.indexOf(normalizeKey(right.field.key));
      const normalizedLeftRank = leftRank === -1 ? SUMMARY_FIELD_PRIORITY.length : leftRank;
      const normalizedRightRank = rightRank === -1 ? SUMMARY_FIELD_PRIORITY.length : rightRank;

      if (normalizedLeftRank !== normalizedRightRank) {
        return normalizedLeftRank - normalizedRightRank;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.field);
}

export function explainServerDetails(server: ServerRecord, notes: ServerNotes): ExplainedServerDetails {
  const description = (notes.description ?? "").trim() || explainDescription(server);
  const fieldHints = notes.field_hints ?? {};
  const fields = Object.entries(server.payload).map(([key, value]) => ({
    key,
    value,
    display_value: formatScalar(value),
    hint: fieldHints[key]?.trim() || explainFieldHint(key),
  }));
  const summary_fields = sortSummaryFields(fields).slice(0, DEFAULT_SUMMARY_FIELD_LIMIT);
  const hidden_field_count = Math.max(fields.length - summary_fields.length, 0);

  return {
    description,
    fields,
    summary_fields,
    hidden_field_count,
  };
}
