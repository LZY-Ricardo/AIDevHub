import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/ServerRawEditor.tsx", import.meta.url), "utf8");

test("高级编辑不会在 payload 变化时无条件重置文本", () => {
  assert.doesNotMatch(
    source,
    /useEffect\(\(\) => \{\s*setText\(JSON\.stringify\(payload, null, 2\)\);\s*setError\(null\);\s*onValidityChange\(null\);\s*\}, \[payload, onValidityChange\]\);/s,
  );
});

test("高级编辑会跟踪最近一次本地提交的 payload", () => {
  assert.match(source, /lastAppliedPayloadRef/);
});
