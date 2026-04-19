import { act } from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { update, api } = vi.hoisted(() => ({
  update: {
    source_id: "codex.mcp.json",
    client: "codex" as const,
    kind: "mcp" as const,
    current_sha256: "abc",
    diff_unified: "@@",
    requires_confirm_sync: true,
    confirm_sync_available: true,
  },
  api: {
    configCheckUpdates: vi.fn(),
    settingsGet: vi.fn(),
    serverList: vi.fn(),
    skillList: vi.fn(),
    configAcceptMcpUpdates: vi.fn(),
    configIgnoreUpdates: vi.fn(),
  },
}));

vi.mock("../src/lib/api", () => ({ api }));
vi.mock("../src/components/TopNavShell", () => ({
  TopNavShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../src/components/Dashboard", () => ({ Dashboard: () => null }));
vi.mock("../src/components/SettingsTabs", () => ({ SettingsTabs: () => null }));
vi.mock("../src/components/McpConfigDiffDialog", () => ({ McpConfigDiffDialog: () => null }));
vi.mock("../src/components/McpConfigDiffSummaryDialog", () => ({ McpConfigDiffSummaryDialog: () => null }));
vi.mock("../src/pages/ServersPage", () => ({ ServersPage: () => null }));
vi.mock("../src/pages/SkillsPage", () => ({ SkillsPage: () => null }));
vi.mock("../src/pages/ProfilesPage", () => ({ ProfilesPage: () => null }));
vi.mock("../src/pages/BackupsPage", () => ({ BackupsPage: () => null }));
vi.mock("../src/pages/SettingsPage", () => ({ SettingsPage: () => null }));
vi.mock("../src/components/UpdateChecker", () => ({ UpdateChecker: () => null }));
vi.mock("../src/components/ConfigChangeDialog", () => ({
  ConfigChangeDialog: ({
    open,
    busy,
    updates,
    onConfirmMcp,
  }: {
    open: boolean;
    busy: boolean;
    updates: Array<typeof update>;
    onConfirmMcp: (request: { source_id: string; current_sha256: string; client: "codex" | "claude_code" }) => Promise<unknown>;
  }) =>
    open ? (
      <button
        type="button"
        disabled={busy}
        onClick={() => void onConfirmMcp({
          source_id: updates[0]?.source_id ?? update.source_id,
          current_sha256: updates[0]?.current_sha256 ?? update.current_sha256,
          client: updates[0]?.client ?? update.client,
        })}
      >
        confirm-mcp
      </button>
    ) : null,
}));

async function renderFreshApp() {
  const mod = await import("../src/App");
  return render(<mod.default />);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetModules();
  api.configCheckUpdates.mockResolvedValue({ updates: [] });
  api.settingsGet.mockResolvedValue({ mcp_diff_check_mode: "open_diff" });
  api.serverList.mockResolvedValue([]);
  api.skillList.mockResolvedValue([]);
  api.configIgnoreUpdates.mockResolvedValue({ ignored_source_ids: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

test("App 会在 5 秒后自动隐藏 PRECONDITION_FAILED 错误", async () => {
  api.configCheckUpdates.mockResolvedValue({ updates: [update] });
  api.configAcceptMcpUpdates.mockRejectedValue({ code: "PRECONDITION_FAILED", message: "stale" });
  await renderFreshApp();

  await screen.findByText("confirm-mcp");
  await waitFor(() => expect((screen.getByText("confirm-mcp") as HTMLButtonElement).disabled).toBe(false));
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(screen.getByText("confirm-mcp"));
    await Promise.resolve();
  });

  expect(screen.getByText("PRECONDITION_FAILED")).toBeTruthy();

  await act(async () => {
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  expect(screen.queryByText("PRECONDITION_FAILED")).toBeNull();
}, 10000);

test("App 不会自动隐藏非 PRECONDITION_FAILED 错误", async () => {
  api.configCheckUpdates.mockResolvedValue({ updates: [update] });
  api.configAcceptMcpUpdates.mockRejectedValue({ code: "IO_ERROR", message: "write failed" });
  await renderFreshApp();

  await screen.findByText("confirm-mcp");
  await waitFor(() => expect((screen.getByText("confirm-mcp") as HTMLButtonElement).disabled).toBe(false));
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(screen.getByText("confirm-mcp"));
    await Promise.resolve();
  });

  expect(screen.getByText("IO_ERROR")).toBeTruthy();

  await act(async () => {
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  expect(screen.getByText("IO_ERROR")).toBeTruthy();
}, 10000);

test("App 在同值 PRECONDITION_FAILED 重新出现时会重置自动隐藏计时器", async () => {
  api.configCheckUpdates.mockResolvedValue({ updates: [update] });
  api.configAcceptMcpUpdates.mockRejectedValue({ code: "PRECONDITION_FAILED", message: "stale" });
  await renderFreshApp();

  await screen.findByText("confirm-mcp");
  await waitFor(() => expect((screen.getByText("confirm-mcp") as HTMLButtonElement).disabled).toBe(false));
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(screen.getByText("confirm-mcp"));
    await Promise.resolve();
  });
  expect(screen.getByText("PRECONDITION_FAILED")).toBeTruthy();

  await act(async () => {
    vi.advanceTimersByTime(4000);
    await Promise.resolve();
  });

  await act(async () => {
    fireEvent.click(screen.getByText("confirm-mcp"));
    await Promise.resolve();
  });
  expect(screen.getByText("PRECONDITION_FAILED")).toBeTruthy();

  await act(async () => {
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
  });

  expect(screen.getByText("PRECONDITION_FAILED")).toBeTruthy();

  await act(async () => {
    vi.advanceTimersByTime(4000);
    await Promise.resolve();
  });

  expect(screen.queryByText("PRECONDITION_FAILED")).toBeNull();
}, 10000);

test("App 在确认请求进行中会把对话框置为 busy，并在失败后恢复", async () => {
  api.configCheckUpdates.mockResolvedValue({ updates: [update] });
  const deferred = createDeferred<never>();
  api.configAcceptMcpUpdates.mockImplementation(() => deferred.promise);

  await renderFreshApp();

  const button = await screen.findByText("confirm-mcp");
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));

  fireEvent.click(button);
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));

  deferred.reject({ code: "IO_ERROR", message: "write failed" });
  await act(async () => {
    await Promise.resolve();
  });

  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByText("IO_ERROR")).toBeTruthy();
});

test("App 卸载时会清理自动隐藏定时器", async () => {
  api.configCheckUpdates.mockResolvedValue({ updates: [update] });
  api.configAcceptMcpUpdates.mockRejectedValue({ code: "PRECONDITION_FAILED", message: "stale" });

  const setTimeoutSpy = vi.spyOn(window, "setTimeout");
  const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

  const view = await renderFreshApp();

  await screen.findByText("confirm-mcp");
  await waitFor(() => expect((screen.getByText("confirm-mcp") as HTMLButtonElement).disabled).toBe(false));
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(screen.getByText("confirm-mcp"));
    await Promise.resolve();
  });

  expect(screen.getByText("PRECONDITION_FAILED")).toBeTruthy();
  expect(setTimeoutSpy).toHaveBeenCalled();

  view.unmount();

  expect(clearTimeoutSpy).toHaveBeenCalled();
  setTimeoutSpy.mockRestore();
  clearTimeoutSpy.mockRestore();
});
