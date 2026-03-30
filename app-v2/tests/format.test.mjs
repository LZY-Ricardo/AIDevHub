import test from "node:test";
import assert from "node:assert/strict";

function formatRelativeTime(iso) {
  const now = Date.now();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("formatRelativeTime: 刚刚", () => {
  const result = formatRelativeTime(new Date().toISOString());
  assert.equal(result, "刚刚");
});

test("formatRelativeTime: X分钟前", () => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
  const result = formatRelativeTime(fiveMinAgo);
  assert.equal(result, "5分钟前");
});

test("formatRelativeTime: X小时前", () => {
  const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
  const result = formatRelativeTime(threeHoursAgo);
  assert.equal(result, "3小时前");
});

test("formatRelativeTime: X天前", () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  const result = formatRelativeTime(twoDaysAgo);
  assert.equal(result, "2天前");
});

test("formatRelativeTime: 超过7天显示日期", () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
  const result = formatRelativeTime(tenDaysAgo);
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

test("formatRelativeTime: 无效输入原样返回", () => {
  assert.equal(formatRelativeTime("not-a-date"), "not-a-date");
});
