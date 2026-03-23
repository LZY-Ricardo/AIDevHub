import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");

test("api 暴露 configAcceptMcpUpdates 并调用 tauri config_accept_mcp_updates", () => {
  assert.match(source, /configAcceptMcpUpdates\s*\(payload:\s*ConfigConfirmMcpRequest\)/);
  assert.match(source, /invokeCmd\("config_accept_mcp_updates"/);
  assert.match(source, /sourceId:\s*payload\.source_id/);
  assert.match(source, /currentSha256:\s*payload\.current_sha256/);
});
