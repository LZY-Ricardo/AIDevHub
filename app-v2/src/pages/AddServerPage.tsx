import { useState } from "react";
import type { AppError, Client, FilePrecondition, WritePreview } from "../lib/types";
import { api } from "../lib/api";
import { clientLabel } from "../lib/format";
import { WritePreviewDialog } from "../components/WritePreviewDialog";

type Transport = "stdio" | "http";

export function AddServerPage() {
  const [client, setClient] = useState<Client>("codex");
  const [transport, setTransport] = useState<Transport>("stdio");
  const [name, setName] = useState("");

  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");

  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [bearerTokenEnvVar, setBearerTokenEnvVar] = useState("");

  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  const [preview, setPreview] = useState<WritePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  async function previewAdd() {
    setError(null);
    setBusy(true);
    setPreview(null);
    try {
      const payload = buildPayload();
      const p = await api.serverPreviewAdd(payload);
      setPreview(p);
      setPreviewOpen(true);
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  async function applyAdd(expected_files: FilePrecondition[]) {
    setError(null);
    setBusy(true);
    try {
      const payload = buildPayload();
      await api.serverApplyAdd({ ...payload, expected_files });
      setPreviewOpen(false);
      // keep MVP minimal: reset only a few fields, do not navigate implicitly
      setName("");
      setCommand("");
      setArgsText("");
      setEnvText("");
      setUrl("");
      setHeadersText("");
      setBearerTokenEnvVar("");
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  }

  function buildPayload(): {
    client: Client;
    name: string;
    transport: Transport;
    config: Record<string, unknown>;
  } {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw { code: "VALIDATION_ERROR", message: "name 不能为空" } satisfies AppError;
    }

    if (transport === "stdio") {
      const cmd = command.trim();
      if (!cmd) throw { code: "VALIDATION_ERROR", message: "command 不能为空" } satisfies AppError;
      const args = parseLines(argsText);
      const env = client === "claude_code" ? parseKeyValue(envText) : undefined;

      const cfg: Record<string, unknown> = { command: cmd };
      if (args.length) cfg.args = args;
      if (env && Object.keys(env).length) cfg.env = env;
      return { client, name: trimmedName, transport, config: cfg };
    }

    // http
    const u = url.trim();
    if (!u) throw { code: "VALIDATION_ERROR", message: "url 不能为空" } satisfies AppError;
    const cfg: Record<string, unknown> = { url: u };
    if (client === "claude_code") {
      const headers = parseKeyValue(headersText);
      if (Object.keys(headers).length) cfg.headers = headers;
    } else {
      const v = bearerTokenEnvVar.trim();
      if (v) cfg.bearer_token_env_var = v;
    }
    return { client, name: trimmedName, transport, config: cfg };
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {error ? (
        <div className="ui-error">
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{error.code}</div>
          <div style={{ marginTop: "8px", color: "rgba(248, 250, 252, 0.86)" }}>{error.message}</div>
        </div>
      ) : null}

      <div className="ui-card">
        <div className="ui-formGrid">
          <div className="ui-field">
            <div className="ui-label">Client</div>
            <select className="ui-select" value={client} onChange={(e) => setClient(e.currentTarget.value as Client)}>
              <option value="claude_code">{clientLabel("claude_code")}</option>
              <option value="codex">{clientLabel("codex")}</option>
            </select>
            <div className="ui-help">选择将写入哪个客户端的全局配置。</div>
          </div>

          <div className="ui-field">
            <div className="ui-label">Transport</div>
            <select className="ui-select" value={transport} onChange={(e) => setTransport(e.currentTarget.value as Transport)}>
              <option value="stdio">stdio</option>
              <option value="http">http</option>
            </select>
            <div className="ui-help">MVP 仅支持 stdio / http。</div>
          </div>

          <div className="ui-field ui-fieldFull">
            <div className="ui-label">Name</div>
            <input className="ui-input" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="例如: context7 / github / local_files" />
            <div className="ui-help">
              将作为 Claude 的 mcpServers key 或 Codex 的 mcp_servers.&lt;id&gt;。
            </div>
          </div>
        </div>
      </div>

      {transport === "stdio" ? (
        <div className="ui-card">
          <div className="ui-formGrid">
            <div className="ui-field ui-fieldFull">
              <div className="ui-label">Command</div>
              <input className="ui-input ui-code" value={command} onChange={(e) => setCommand(e.currentTarget.value)} placeholder="例如: node / npx / python" />
            </div>
            <div className="ui-field ui-fieldFull">
              <div className="ui-label">Args (one per line)</div>
              <textarea className="ui-textarea ui-code" rows={5} value={argsText} onChange={(e) => setArgsText(e.currentTarget.value)} placeholder={'例如:\n-y\n@upstash/context7-mcp'} />
              <div className="ui-help">会按行拆分为 args 数组，空行将忽略。</div>
            </div>
            {client === "claude_code" ? (
              <div className="ui-field ui-fieldFull">
                <div className="ui-label">Env (KEY=VALUE per line)</div>
                <textarea className="ui-textarea ui-code" rows={5} value={envText} onChange={(e) => setEnvText(e.currentTarget.value)} placeholder={'例如:\nAPI_KEY=xxxx\nBASE_URL=https://...'} />
                <div className="ui-help">默认会写入配置文件与备份文件。建议优先用系统环境变量，避免硬编码 secrets。</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="ui-card">
          <div className="ui-formGrid">
            <div className="ui-field ui-fieldFull">
              <div className="ui-label">URL</div>
              <input className="ui-input ui-code" value={url} onChange={(e) => setUrl(e.currentTarget.value)} placeholder="例如: http://localhost:8080/mcp" />
            </div>
            {client === "claude_code" ? (
              <div className="ui-field ui-fieldFull">
                <div className="ui-label">Headers (KEY=VALUE per line)</div>
                <textarea className="ui-textarea ui-code" rows={5} value={headersText} onChange={(e) => setHeadersText(e.currentTarget.value)} placeholder={'例如:\nAuthorization=Bearer ${TOKEN}\nX-Org=dev'} />
                <div className="ui-help">默认会写入配置文件与备份文件。注意避免在截图/屏幕共享中泄露。</div>
              </div>
            ) : (
              <div className="ui-field ui-fieldFull">
                <div className="ui-label">bearer_token_env_var (optional)</div>
                <input className="ui-input ui-code" value={bearerTokenEnvVar} onChange={(e) => setBearerTokenEnvVar(e.currentTarget.value)} placeholder="例如: FIGMA_OAUTH_TOKEN" />
                <div className="ui-help">Codex http server 常用方式：从环境变量读取 bearer token。</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="ui-btnRow">
        <button type="button" className="ui-btn ui-btnPrimary" onClick={previewAdd} disabled={busy}>
          {busy ? "生成预览中..." : "生成变更预览"}
        </button>
      </div>

      <WritePreviewDialog
        title="新增 Server 预览"
        preview={preview}
        open={previewOpen}
        busy={busy}
        onClose={() => {
          if (busy) return;
          setPreviewOpen(false);
        }}
        onConfirm={applyAdd}
      />
    </div>
  );
}

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKeyValue(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}
