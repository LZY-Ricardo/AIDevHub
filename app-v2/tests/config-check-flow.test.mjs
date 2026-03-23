import test from "node:test";
import assert from "node:assert/strict";
import {
  createRequestCoordinator,
  buildConfirmMcpRequest,
  toIgnoreConditions,
} from "../src/lib/config-check-flow.js";

test("请求协调器在并发请求下只接受最新响应", () => {
  const flow = createRequestCoordinator();
  const req1 = flow.begin();
  const req2 = flow.begin();

  assert.equal(flow.isLatest(req1), false);
  assert.equal(flow.isLatest(req2), true);
});

test("请求协调器不会被较早结束的旧请求错误清空 busy", () => {
  const flow = createRequestCoordinator();
  const req1 = flow.begin();
  const req2 = flow.begin();

  assert.equal(flow.getBusy(), true);
  assert.equal(flow.end(req1), true);
  assert.equal(flow.getBusy(), true);
  assert.equal(flow.end(req2), false);
  assert.equal(flow.getBusy(), false);
});

test("忽略条件由当前 updates 快照构建", () => {
  const conditions = toIgnoreConditions([
    { source_id: "a", current_sha256: "1" },
    { source_id: "b", current_sha256: "2" },
  ]);
  assert.deepEqual(conditions, [
    { source_id: "a", current_sha256: "1" },
    { source_id: "b", current_sha256: "2" },
  ]);
});

test("confirm MCP 请求边界与检测 DTO 解耦", () => {
  const req = buildConfirmMcpRequest({
    source_id: "mcp://demo",
    current_sha256: "abc",
    client: "codex",
    kind: "mcp",
    requires_confirm_sync: true,
    confirm_sync_available: true,
  });
  assert.deepEqual(req, {
    source_id: "mcp://demo",
    current_sha256: "abc",
    client: "codex",
  });
  assert.equal(
    buildConfirmMcpRequest({
      source_id: "skill://x",
      current_sha256: "y",
      client: "claude_code",
      kind: "skill",
      requires_confirm_sync: true,
      confirm_sync_available: true,
    }),
    null,
  );
});
