import { useEffect, useMemo, useState } from "react";
import { AppShell, type RouteKey } from "./components/AppShell";
import { ConfigChangeDialog } from "./components/ConfigChangeDialog";
import { createRequestCoordinator } from "./lib/config-check-flow.js";
import { confirmMcpUpdateWithRefresh } from "./lib/config-confirm-flow.js";
import {
  deriveCheckResultState,
  deriveIgnorePreflightState,
  shouldRefreshAfterIgnore,
} from "./lib/config-check-state.js";
import { api } from "./lib/api";
import type {
  AppError,
  ConfigConfirmMcpRequest,
  ConfigConfirmMcpResponse,
  ConfigUpdateItem,
} from "./lib/types";
import { ServersPage } from "./pages/ServersPage";
import { AddServerPage } from "./pages/AddServerPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SkillsPage } from "./pages/SkillsPage";
import { BackupsPage } from "./pages/BackupsPage";

let startupConfigCheckBootstrapped = false;

function App() {
  const [route, setRoute] = useState<RouteKey>(() => readRouteFromHash() ?? "servers");
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [updates, setUpdates] = useState<ConfigUpdateItem[]>([]);
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState<AppError | null>(null);
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

  return (
    <AppShell route={route} onNavigate={navigate}>
      {route === "servers" ? <ServersPage onCheckConfigUpdates={runConfigCheck} configCheckBusy={configBusy} /> : null}
      {route === "add" ? <AddServerPage /> : null}
      {route === "profiles" ? <ProfilesPage /> : null}
      {route === "skills" ? <SkillsPage /> : null}
      {route === "backups" ? <BackupsPage /> : null}
      <ConfigChangeDialog
        updates={updates}
        open={configDialogOpen}
        busy={configBusy}
        onClose={() => setConfigDialogOpen(false)}
        onIgnore={ignoreConfigUpdates}
        onConfirmMcp={confirmMcpUpdate}
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
    </AppShell>
  );
}

function readRouteFromHash(): RouteKey | null {
  const h = window.location.hash || "";
  const match = h.match(/^#\/(servers|add|profiles|skills|backups)$/);
  if (!match) return null;
  return match[1] as RouteKey;
}

export default App;
