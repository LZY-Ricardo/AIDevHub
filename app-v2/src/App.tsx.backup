import { useEffect, useMemo, useState } from "react";
import { AppShell, type RouteKey } from "./components/AppShell";
import { ConfigChangeDialog } from "./components/ConfigChangeDialog";
import { McpConfigDiffDialog } from "./components/McpConfigDiffDialog";
import { McpConfigDiffSummaryDialog } from "./components/McpConfigDiffSummaryDialog";
import { createRequestCoordinator } from "./lib/config-check-flow.js";
import { confirmMcpUpdateWithRefresh } from "./lib/config-confirm-flow.js";
import {
  deriveCheckResultState,
  deriveIgnorePreflightState,
  shouldRefreshAfterIgnore,
} from "./lib/config-check-state.js";
import { api } from "./lib/api";
import type {
  AppSettings,
  AppError,
  ConfigConfirmMcpRequest,
  ConfigConfirmMcpResponse,
  ConfigUpdateItem,
  Client,
  FilePrecondition,
  McpRegistryExternalDiff,
} from "./lib/types";
import { ServersPage } from "./pages/ServersPage";
import { AddServerPage } from "./pages/AddServerPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SkillsPage } from "./pages/SkillsPage";
import { BackupsPage } from "./pages/BackupsPage";
import { SettingsPage } from "./pages/SettingsPage";

let startupConfigCheckBootstrapped = false;

function App() {
  const [route, setRoute] = useState<RouteKey>(() => readRouteFromHash() ?? "servers");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<AppError | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [updates, setUpdates] = useState<ConfigUpdateItem[]>([]);
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState<AppError | null>(null);
  const [registryDiff, setRegistryDiff] = useState<McpRegistryExternalDiff | null>(null);
  const [registryDiffDialogOpen, setRegistryDiffDialogOpen] = useState(false);
  const [registrySummaryDialogOpen, setRegistrySummaryDialogOpen] = useState(false);
  const [registryFlowBusy, setRegistryFlowBusy] = useState(false);
  const [registryFlowError, setRegistryFlowError] = useState<AppError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const configCheckFlow = useMemo(() => createRequestCoordinator(), []);

  useEffect(() => {
    const onHash = () => {
      const r = readRouteFromHash();
      if (r) setRoute(r);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (startupConfigCheckBootstrapped) return;
    startupConfigCheckBootstrapped = true;
    void runConfigCheck();
  }, []);

  useEffect(() => {
    void loadSettings();
  }, []);

  function navigate(r: RouteKey) {
    setRoute(r);
    window.location.hash = `#/${r}`;
  }

  async function runConfigCheck(options?: { propagateError?: boolean }) {
    const requestId = configCheckFlow.begin();
    setConfigBusy(true);
    setConfigError(null);
    try {
      const res = await api.configCheckUpdates();
      if (!configCheckFlow.isLatest(requestId)) return;
      const next = deriveCheckResultState(res.updates, configError);
      setUpdates(next.updates);
      setConfigDialogOpen(next.dialogOpen);
      setConfigError(next.error);
    } catch (e) {
      if (!configCheckFlow.isLatest(requestId)) return;
      setConfigError(e as AppError);
      if (options?.propagateError) {
        throw e;
      }
    } finally {
      setConfigBusy(configCheckFlow.end(requestId));
    }
  }

  async function loadSettings() {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const next = await api.settingsGet();
      setSettings(next);
    } catch (e) {
      setSettings(null);
      setSettingsError(e as AppError);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function saveSettings(next: AppSettings) {
    if (!settings) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const saved = await api.settingsPut(next);
      setSettings(saved);
    } catch (e) {
      setSettingsError(e as AppError);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function ignoreConfigUpdates(conditions: { source_id: string; current_sha256: string }[]) {
    if (conditions.length === 0 || configBusy) return;
    setConfigBusy(true);
    setConfigError(null);
    const preflight = deriveIgnorePreflightState();
    setUpdates(preflight.updates);
    setConfigDialogOpen(preflight.dialogOpen);
    let ignoreError: unknown = null;
    try {
      await api.configIgnoreUpdates({ conditions });
    } catch (e) {
      ignoreError = e;
      setConfigError(e as AppError);
    } finally {
      if (shouldRefreshAfterIgnore(ignoreError)) {
        await runConfigCheck();
      }
    }
  }

  async function confirmMcpUpdate(request: ConfigConfirmMcpRequest): Promise<ConfigConfirmMcpResponse> {
    return confirmMcpUpdateWithRefresh({
      request,
      configBusy,
      setConfigBusy,
      setConfigError,
      acceptMcpUpdate: (nextRequest) => api.configAcceptMcpUpdates(nextRequest),
      refreshConfigCheck: (options) => runConfigCheck(options),
      deriveStaleState: () => deriveIgnorePreflightState(),
      applyStaleState: (stale) => {
        setUpdates(stale.updates);
        setConfigDialogOpen(stale.dialogOpen);
      },
    });
  }

  async function onCheckRegistryExternalDiff(client: Client) {
    setRegistryFlowBusy(true);
    setRegistryFlowError(null);
    try {
      const next = await api.mcpCheckRegistryExternalDiff({ client });
      setRegistryDiff(next);
      if (settings?.mcp_diff_check_mode === "summary_only") {
        setRegistryDiffDialogOpen(false);
        setRegistrySummaryDialogOpen(true);
      } else if (settings?.mcp_diff_check_mode === "open_diff" || !settings?.mcp_diff_check_mode) {
        setRegistrySummaryDialogOpen(false);
        setRegistryDiffDialogOpen(true);
      }
    } catch (e) {
      setRegistryFlowError(e as AppError);
    } finally {
      setRegistryFlowBusy(false);
    }
  }

  async function onPreviewSyncRegistryToExternal(client: Client) {
    return api.mcpPreviewSyncRegistryToExternal({ client });
  }

  async function onApplySyncRegistryToExternal(payload: { client: Client; expected_files: FilePrecondition[] }) {
    setRegistryFlowBusy(true);
    setRegistryFlowError(null);
    try {
      await api.mcpApplySyncRegistryToExternal(payload);
      setRegistryDiff(null);
      setRegistryDiffDialogOpen(false);
      setRegistrySummaryDialogOpen(false);
      setReloadToken((value) => value + 1);
    } catch (e) {
      setRegistryFlowError(e as AppError);
      throw e;
    } finally {
      setRegistryFlowBusy(false);
    }
  }

  return (
    <AppShell route={route} onNavigate={navigate}>
      {route === "servers" ? (
        <ServersPage
          onCheckConfigUpdates={runConfigCheck}
          configCheckBusy={configBusy}
          onCheckRegistryExternalDiff={onCheckRegistryExternalDiff}
          onPreviewSyncRegistryToExternal={onPreviewSyncRegistryToExternal}
          onApplySyncRegistryToExternal={onApplySyncRegistryToExternal}
          reloadToken={reloadToken}
        />
      ) : null}
      {route === "add" ? <AddServerPage /> : null}
      {route === "profiles" ? <ProfilesPage /> : null}
      {route === "skills" ? <SkillsPage /> : null}
      {route === "backups" ? <BackupsPage /> : null}
      {route === "settings" ? (
        <SettingsPage settings={settings} busy={settingsBusy} error={settingsError} onSave={saveSettings} />
      ) : null}
      <ConfigChangeDialog
        updates={updates}
        open={configDialogOpen}
        busy={configBusy}
        onClose={() => setConfigDialogOpen(false)}
        onIgnore={ignoreConfigUpdates}
        onConfirmMcp={confirmMcpUpdate}
      />
      <McpConfigDiffDialog
        diff={registryDiff}
        open={registryDiffDialogOpen}
        busy={registryFlowBusy}
        onClose={() => setRegistryDiffDialogOpen(false)}
      />
      <McpConfigDiffSummaryDialog
        diff={registryDiff}
        open={registrySummaryDialogOpen}
        busy={registryFlowBusy}
        onClose={() => setRegistrySummaryDialogOpen(false)}
        onViewDiff={() => {
          if (!registryDiff?.has_diff) return;
          setRegistrySummaryDialogOpen(false);
          setRegistryDiffDialogOpen(true);
        }}
      />
      {configError ? (
        <div
          className="ui-error"
          style={{ position: "fixed", right: "20px", bottom: "20px", maxWidth: "460px", zIndex: 120 }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{configError.code}</div>
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{configError.message}</div>
        </div>
      ) : null}
      {registryFlowError ? (
        <div
          className="ui-error"
          style={{ position: "fixed", left: "20px", bottom: "20px", maxWidth: "460px", zIndex: 120 }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{registryFlowError.code}</div>
          <div style={{ marginTop: "8px", color: "var(--color-muted)" }}>{registryFlowError.message}</div>
        </div>
      ) : null}
    </AppShell>
  );
}

function readRouteFromHash(): RouteKey | null {
  const h = window.location.hash || "";
  const match = h.match(/^#\/(servers|add|profiles|skills|backups|settings)$/);
  if (!match) return null;
  return match[1] as RouteKey;
}

export default App;
