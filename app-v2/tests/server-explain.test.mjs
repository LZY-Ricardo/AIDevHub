import test from "node:test";
import assert from "node:assert/strict";

import { explainServerDetails } from "../src/lib/serverExplain.ts";

const baseServer = {
  server_id: "codex:playwright",
  name: "playwright",
  client: "codex",
  transport: "stdio",
  enabled: true,
  source_file: "/tmp/config.toml",
  identity: "npx @playwright/mcp@latest",
  payload: {
    command: "npx",
    args: ["@playwright/mcp@latest"],
  },
};

test("已知 MCP 返回更具体的功能作用说明", () => {
  const result = explainServerDetails(baseServer, { description: "", field_hints: {} });

  assert.equal(result.description, "用于浏览器自动化操作，例如打开页面、点击、截图和表单交互。");
});

test("常见配置项返回预期用途说明", () => {
  const result = explainServerDetails(baseServer, { description: "", field_hints: {} });
  const commandField = result.fields.find((field) => field.key === "command");
  const argsField = result.fields.find((field) => field.key === "args");

  assert.equal(commandField?.hint, "启动本地 MCP 服务的命令。");
  assert.equal(argsField?.hint, "传给启动命令的参数。");
});

test("人工说明优先覆盖自动生成的描述和字段说明", () => {
  const result = explainServerDetails(baseServer, {
    description: "团队约定：用于录制和调试浏览器流程。",
    field_hints: {
      command: "团队统一通过该命令启动 Playwright MCP。",
    },
  });

  assert.equal(result.description, "团队约定：用于录制和调试浏览器流程。");
  assert.equal(
    result.fields.find((field) => field.key === "command")?.hint,
    "团队统一通过该命令启动 Playwright MCP。",
  );
});

test("缺少 field_hints 时仍能回退到自动说明", () => {
  const result = explainServerDetails(baseServer, {
    description: "",
  });

  assert.equal(result.description, "用于浏览器自动化操作，例如打开页面、点击、截图和表单交互。");
  assert.equal(
    result.fields.find((field) => field.key === "command")?.hint,
    "启动本地 MCP 服务的命令。",
  );
});
