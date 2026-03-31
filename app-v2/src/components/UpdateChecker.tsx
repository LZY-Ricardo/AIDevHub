import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdate, downloadInstallAndRelaunch } from "../lib/updater";

type Phase = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

export function UpdateChecker() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [newVersion, setNewVersion] = useState<string>("");
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState("");
  const [appVersion, setAppVersion] = useState("...");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("unknown"));
  }, []);

  async function handleCheck() {
    setPhase("checking");
    setErrorMsg("");
    try {
      const update = await checkForUpdate();
      if (update) {
        setNewVersion(update.version);
        setPhase("available");
      } else {
        setPhase("up-to-date");
      }
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      setPhase("error");
    }
  }

  async function handleDownloadInstall() {
    setPhase("downloading");
    try {
      await downloadInstallAndRelaunch((p) => {
        setProgress({ downloaded: p.downloaded, total: p.total || 0 });
      });
      // On Windows, app exits during downloadAndInstall (NSIS takes over).
      // On macOS/Linux, relaunch() restarts the app immediately.
      // Neither platform reaches this point, but if it does, reset to idle.
      setPhase("idle");
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      setPhase("error");
    }
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <section className="ui-card" style={{ padding: "16px" }}>
        <div className="ui-label">应用更新</div>
        <div className="ui-help" style={{ marginTop: "8px" }}>
          当前版本：{appVersion}
        </div>

        <div style={{ marginTop: "16px" }}>
          {phase === "idle" && (
            <button
              type="button"
              className="ui-btn ui-btnPrimary"
              onClick={handleCheck}
            >
              检查更新
            </button>
          )}

          {phase === "checking" && (
            <span className="ui-help">正在检查更新…</span>
          )}

          {phase === "up-to-date" && (
            <div>
              <span style={{ color: "var(--color-success, #22c55e)" }}>
                已是最新版本
              </span>
              <button
                type="button"
                className="ui-btn"
                style={{ marginLeft: "12px" }}
                onClick={() => setPhase("idle")}
              >
                再次检查
              </button>
            </div>
          )}

          {phase === "available" && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                发现新版本：
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                  {newVersion}
                </span>
              </div>
              <button
                type="button"
                className="ui-btn ui-btnPrimary"
                onClick={handleDownloadInstall}
              >
                下载并安装
              </button>
            </div>
          )}

          {phase === "downloading" && (
            <div style={{ display: "grid", gap: "8px" }}>
              <span className="ui-help">正在下载并安装更新…</span>
              {progress.total > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      flex: 1,
                      height: "6px",
                      borderRadius: "3px",
                      background: "var(--color-border, #e5e7eb)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (progress.downloaded / progress.total) * 100)}%`,
                        height: "100%",
                        background: "var(--color-accent, #3b82f6)",
                        borderRadius: "3px",
                        transition: "width 0.2s",
                      }}
                    />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                    {Math.round((progress.downloaded / progress.total) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {phase === "error" && (
            <div>
              <div className="ui-error" style={{ padding: "12px" }}>
                {errorMsg}
              </div>
              <button
                type="button"
                className="ui-btn"
                style={{ marginTop: "12px" }}
                onClick={() => setPhase("idle")}
              >
                重试
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
