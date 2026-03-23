import test from "node:test";
import assert from "node:assert/strict";
import { confirmMcpUpdateWithRefresh } from "../src/lib/config-confirm-flow.js";

test("accept 成功但 refresh 失败时仍返回 accept 成功，并清理 stale diff", async () => {
  const calls = [];
  const acceptResponse = { accepted: true, message: "ok" };
  const refreshError = { code: "IO_ERROR", message: "refresh failed" };
  const staleState = { updates: [], dialogOpen: false };

  const result = await confirmMcpUpdateWithRefresh({
    request: { source_id: "codex.mcp.json", current_sha256: "abc", client: "codex" },
    configBusy: false,
    setConfigBusy(v) {
      calls.push(["busy", v]);
    },
    setConfigError(err) {
      calls.push(["error", err]);
    },
    acceptMcpUpdate: async () => acceptResponse,
    refreshConfigCheck: async () => {
      throw refreshError;
    },
    deriveStaleState: () => staleState,
    applyStaleState(state) {
      calls.push(["stale", state]);
    },
  });

  assert.deepEqual(result, acceptResponse);
  assert.deepEqual(calls, [
    ["busy", true],
    ["error", null],
    ["error", refreshError],
    ["stale", staleState],
    ["busy", false],
  ]);
});

test("accept 失败时返回 accepted=false 且不触发 refresh", async () => {
  const calls = [];
  const acceptError = { code: "PRECONDITION_FAILED", message: "stale" };

  const result = await confirmMcpUpdateWithRefresh({
    request: { source_id: "codex.mcp.json", current_sha256: "abc", client: "codex" },
    configBusy: false,
    setConfigBusy(v) {
      calls.push(["busy", v]);
    },
    setConfigError(err) {
      calls.push(["error", err]);
    },
    acceptMcpUpdate: async () => {
      throw acceptError;
    },
    refreshConfigCheck: async () => {
      calls.push(["refresh"]);
    },
    deriveStaleState: () => ({ updates: [], dialogOpen: false }),
    applyStaleState() {
      calls.push(["stale"]);
    },
  });

  assert.deepEqual(result, { accepted: false, message: "stale" });
  assert.deepEqual(calls, [
    ["busy", true],
    ["error", null],
    ["error", acceptError],
    ["busy", false],
  ]);
});
