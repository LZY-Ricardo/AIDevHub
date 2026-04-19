import test from "node:test";
import assert from "node:assert/strict";
import {
  bindConfigErrorAutoDismiss,
  CONFIG_ERROR_AUTO_DISMISS_MS,
  createConfigErrorAutoDismissUpdater,
  scheduleConfigErrorAutoDismiss,
  shouldAutoDismissConfigError,
} from "../src/lib/config-error-display.js";

test("PRECONDITION_FAILED 会自动隐退", () => {
  assert.equal(shouldAutoDismissConfigError({ code: "PRECONDITION_FAILED", message: "stale" }), true);
});

test("非 PRECONDITION_FAILED 错误保持常驻", () => {
  assert.equal(shouldAutoDismissConfigError({ code: "IO_ERROR", message: "write failed" }), false);
});

test("自动隐退时长为 5 秒", () => {
  assert.equal(CONFIG_ERROR_AUTO_DISMISS_MS, 5000);
});

test("PRECONDITION_FAILED 会注册定时清理，cleanup 时撤销定时器", () => {
  const scheduled = [];
  const cleared = [];
  const token = Symbol("timer");

  const cleanup = scheduleConfigErrorAutoDismiss({
    error: { code: "PRECONDITION_FAILED", message: "stale" },
    onAutoDismiss() {},
    setTimeoutFn(callback, delay) {
      scheduled.push([callback, delay]);
      return token;
    },
    clearTimeoutFn(value) {
      cleared.push(value);
    },
  });

  assert.equal(typeof cleanup, "function");
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0][1], CONFIG_ERROR_AUTO_DISMISS_MS);

  cleanup();
  assert.deepEqual(cleared, [token]);
});

test("非 PRECONDITION_FAILED 不注册自动清理", () => {
  let scheduled = false;

  const cleanup = scheduleConfigErrorAutoDismiss({
    error: { code: "IO_ERROR", message: "write failed" },
    onAutoDismiss() {},
    setTimeoutFn() {
      scheduled = true;
      return 0;
    },
    clearTimeoutFn() {},
  });

  assert.equal(cleanup, null);
  assert.equal(scheduled, false);
});

test("定时器触发后执行自动清理回调", () => {
  let autoDismissed = false;
  let callback = null;

  scheduleConfigErrorAutoDismiss({
    error: { code: "PRECONDITION_FAILED", message: "stale" },
    onAutoDismiss() {
      autoDismissed = true;
    },
    setTimeoutFn(nextCallback) {
      callback = nextCallback;
      return 1;
    },
    clearTimeoutFn() {},
  });

  assert.equal(typeof callback, "function");
  callback();
  assert.equal(autoDismissed, true);
});

test("自动清理只会清除同一个错误实例", () => {
  const expected = { code: "PRECONDITION_FAILED", message: "stale" };
  const updater = createConfigErrorAutoDismissUpdater(expected);

  assert.equal(updater(expected), null);
});

test("同值但不同实例的错误不会被旧定时器误清理", () => {
  const previous = { code: "PRECONDITION_FAILED", message: "stale" };
  const next = { code: "PRECONDITION_FAILED", message: "stale" };
  const updater = createConfigErrorAutoDismissUpdater(previous);

  assert.equal(updater(next), next);
});

test("切换到新的 PRECONDITION_FAILED 前会清理旧定时器", () => {
  const cleared = [];
  const timers = [];

  const cleanup = bindConfigErrorAutoDismiss({
    error: { code: "PRECONDITION_FAILED", message: "first" },
    setConfigError() {},
    setTimeoutFn(callback, delay) {
      const token = { callback, delay };
      timers.push(token);
      return token;
    },
    clearTimeoutFn(timer) {
      cleared.push(timer);
    },
  });

  assert.equal(typeof cleanup, "function");
  cleanup();

  const nextCleanup = bindConfigErrorAutoDismiss({
    error: { code: "PRECONDITION_FAILED", message: "second" },
    setConfigError() {},
    setTimeoutFn(callback, delay) {
      const token = { callback, delay };
      timers.push(token);
      return token;
    },
    clearTimeoutFn(timer) {
      cleared.push(timer);
    },
  });

  assert.equal(cleared.length, 1);
  assert.equal(typeof nextCleanup, "function");
  assert.equal(timers.length, 2);
});

test("切换到非自动隐退错误时会撤销旧定时器且不注册新定时器", () => {
  const cleared = [];
  const timers = [];

  const cleanup = bindConfigErrorAutoDismiss({
    error: { code: "PRECONDITION_FAILED", message: "first" },
    setConfigError() {},
    setTimeoutFn(callback, delay) {
      const token = { callback, delay };
      timers.push(token);
      return token;
    },
    clearTimeoutFn(timer) {
      cleared.push(timer);
    },
  });

  cleanup();

  const nextCleanup = bindConfigErrorAutoDismiss({
    error: { code: "IO_ERROR", message: "write failed" },
    setConfigError() {},
    setTimeoutFn(callback, delay) {
      const token = { callback, delay };
      timers.push(token);
      return token;
    },
    clearTimeoutFn(timer) {
      cleared.push(timer);
    },
  });

  assert.equal(cleared.length, 1);
  assert.equal(nextCleanup, null);
  assert.equal(timers.length, 1);
});
