import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const uiCss = readFileSync(new URL("../src/styles/ui.css", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../src/styles/theme.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = uiCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

test("桌面端侧边栏使用固定侧栏，避免参与滚动链和 sticky 边界释放", () => {
  const sidebar = ruleBody(".ui-sidebar");
  assert.match(sidebar, /box-sizing:\s*border-box;/);
  assert.match(sidebar, /position:\s*fixed;/);
  assert.match(sidebar, /inset:\s*0\s+auto\s+0\s+0;/);
  assert.match(sidebar, /width:\s*272px;/);
  assert.match(sidebar, /overflow:\s*hidden;/);
});

test("桌面端布局把滚动限制在右侧主内容容器内", () => {
  const shell = ruleBody(".ui-shell");
  const main = ruleBody(".ui-main");

  assert.match(shell, /height:\s*100vh;/);
  assert.match(shell, /overflow:\s*hidden;/);
  assert.match(main, /height:\s*100vh;/);
  assert.match(main, /min-height:\s*0;/);
  assert.match(main, /box-sizing:\s*border-box;/);
  assert.match(main, /grid-column:\s*2;/);
  assert.match(main, /overflow-y:\s*auto;/);
  assert.match(main, /overscroll-behavior:\s*contain;/);
});

test("桌面端会封住外层页面滚动链，避免主内容滚动到底后带动整页", () => {
  assert.match(
    themeCss,
    /html,\s*body,\s*#root\s*\{[\s\S]*height:\s*100%;/,
  );
  assert.match(
    themeCss,
    /html,\s*body\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/,
  );
  assert.match(
    themeCss,
    /#root\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/,
  );
});

test("移动端恢复普通文档流，避免锁死整体页面滚动", () => {
  assert.match(
    uiCss,
    /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*\.ui-shell\s*\{[\s\S]*height:\s*auto;[\s\S]*overflow:\s*visible;/,
  );
  assert.match(
    uiCss,
    /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*\.ui-sidebar\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*auto;[\s\S]*overflow:\s*visible;/,
  );
  assert.match(
    uiCss,
    /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*\.ui-main\s*\{[\s\S]*grid-column:\s*auto;[\s\S]*height:\s*auto;[\s\S]*overflow-y:\s*visible;/,
  );
  assert.match(
    themeCss,
    /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*html,\s*body\s*\{[\s\S]*overflow:\s*auto;[\s\S]*overscroll-behavior:\s*auto;/,
  );
  assert.match(
    themeCss,
    /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*#root\s*\{[\s\S]*overflow:\s*visible;/,
  );
});
