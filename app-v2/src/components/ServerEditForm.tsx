import type { Client, Transport } from "../lib/types";

type Payload = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseKeyValueLines(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rawKey, ...rest] = line.split("=");
        return [rawKey.trim(), rest.join("=").trim()];
      })
      .filter(([key]) => key.length > 0),
  );
}

function patchPayload(payload: Payload, key: string, value: unknown, keepEmpty = false): Payload {
  const next = { ...payload };
  const shouldDelete =
    !keepEmpty &&
    (value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0));

  if (shouldDelete) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

export function ServerEditForm({
  client,
  transport,
  payload,
  unknownFields,
  onChange,
}: {
  client: Client;
  transport: Transport;
  payload: Payload;
  unknownFields: string[];
  onChange: (next: Payload) => void;
}) {
  const command = readString(payload.command);
  const url = readString(payload.url);
  const argsText = readStringArray(payload.args).join("\n");
  const envText = Object.entries(readStringMap(payload.env))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const headersText = Object.entries(readStringMap(payload.headers))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const bearerTokenEnvVar = readString(payload.bearer_token_env_var);
  const enabled = payload.enabled !== false;

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div className="ui-label">基础编辑</div>

      {transport === "stdio" ? (
        <>
          <label style={{ display: "grid", gap: "6px" }}>
            <span className="ui-label">command</span>
            <input
              className="ui-input ui-code"
              value={command}
              onChange={(e) => onChange(patchPayload(payload, "command", e.currentTarget.value, true))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span className="ui-label">args</span>
            <textarea
              className="ui-textarea ui-code"
              rows={5}
              value={argsText}
              onChange={(e) => onChange(patchPayload(payload, "args", parseLines(e.currentTarget.value)))}
            />
          </label>
          {client === "claude_code" ? (
            <label style={{ display: "grid", gap: "6px" }}>
              <span className="ui-label">env</span>
              <textarea
                className="ui-textarea ui-code"
                rows={6}
                value={envText}
                onChange={(e) => onChange(patchPayload(payload, "env", parseKeyValueLines(e.currentTarget.value)))}
              />
            </label>
          ) : null}
        </>
      ) : null}

      {transport === "http" ? (
        <>
          <label style={{ display: "grid", gap: "6px" }}>
            <span className="ui-label">url</span>
            <input
              className="ui-input ui-code"
              value={url}
              onChange={(e) => onChange(patchPayload(payload, "url", e.currentTarget.value, true))}
            />
          </label>
          {client === "claude_code" ? (
            <label style={{ display: "grid", gap: "6px" }}>
              <span className="ui-label">headers</span>
              <textarea
                className="ui-textarea ui-code"
                rows={6}
                value={headersText}
                onChange={(e) => onChange(patchPayload(payload, "headers", parseKeyValueLines(e.currentTarget.value)))}
              />
            </label>
          ) : (
            <label style={{ display: "grid", gap: "6px" }}>
              <span className="ui-label">bearer_token_env_var</span>
              <input
                className="ui-input ui-code"
                value={bearerTokenEnvVar}
                onChange={(e) => onChange(patchPayload(payload, "bearer_token_env_var", e.currentTarget.value))}
              />
            </label>
          )}
        </>
      ) : null}

      {client === "codex" ? (
        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange(patchPayload(payload, "enabled", e.currentTarget.checked, true))}
          />
          <span className="ui-label">enabled</span>
        </label>
      ) : null}

      {unknownFields.length > 0 ? (
        <div className="ui-help">
          存在 {unknownFields.length} 个附加字段，保存时会保留；可在高级编辑中查看。
        </div>
      ) : null}

      {client === "claude_code" && transport === "http" ? (
        <div className="ui-help">Claude HTTP MCP 的 `type` 字段由系统维持为 `http`。</div>
      ) : null}
    </div>
  );
}
