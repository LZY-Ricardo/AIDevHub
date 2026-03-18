import { useEffect, useState } from "react";
import { AppShell, type RouteKey } from "./components/AppShell";
import { OverviewPage } from "./pages/OverviewPage";
import { ServersPage } from "./pages/ServersPage";
import { AddServerPage } from "./pages/AddServerPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SkillsPage } from "./pages/SkillsPage";
import { BackupsPage } from "./pages/BackupsPage";

function App() {
  const [route, setRoute] = useState<RouteKey>(() => readRouteFromHash() ?? "overview");

  useEffect(() => {
    const onHash = () => {
      const r = readRouteFromHash();
      if (r) setRoute(r);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function navigate(r: RouteKey) {
    setRoute(r);
    window.location.hash = `#/${r}`;
  }

  return (
    <AppShell route={route} onNavigate={navigate}>
      {route === "overview" ? <OverviewPage /> : null}
      {route === "servers" ? <ServersPage /> : null}
      {route === "add" ? <AddServerPage /> : null}
      {route === "profiles" ? <ProfilesPage /> : null}
      {route === "skills" ? <SkillsPage /> : null}
      {route === "backups" ? <BackupsPage /> : null}
    </AppShell>
  );
}

function readRouteFromHash(): RouteKey | null {
  const h = window.location.hash || "";
  const match = h.match(/^#\/(overview|servers|add|profiles|skills|backups)$/);
  if (!match) return null;
  return match[1] as RouteKey;
}

export default App;
