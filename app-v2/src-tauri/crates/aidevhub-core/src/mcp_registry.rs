use std::{fs, io::Write, path::Path};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use toml_edit::{DocumentMut, Item, Table, Value as TomlValue};

use crate::{
    model::{AppError, Client, Transport},
    ops::AppPaths,
};

const CLAUDE_MCP_SOURCE_ID: &str = "claudecode.mcp.json";
const CODEX_MCP_SOURCE_ID: &str = "codex.mcp.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct McpRegistryStore {
    #[serde(default)]
    pub servers: Vec<McpRegistryServer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRegistryServer {
    pub server_id: String,
    pub client: Client,
    pub name: String,
    pub transport: Transport,
    pub enabled: bool,
    pub payload: Map<String, Value>,
    pub source_origin: String,
    pub updated_at: String,
}

pub fn import_external_source(
    paths: &AppPaths,
    source_id: &str,
    client: Client,
    content: &str,
) -> Result<Vec<String>, AppError> {
    let imported = parse_external_source(source_id, client, content)?;
    let mut store = load_registry_store(&paths.mcp_registry_path)?;

    let imported_ids: std::collections::HashSet<_> =
        imported.iter().map(|s| s.server_id.clone()).collect();
    // Mark registry entries that belong to this client but are absent from
    // the external source as disabled (instead of deleting them).
    for entry in store.servers.iter_mut() {
        if entry.client == client && !imported_ids.contains(&entry.server_id) {
            entry.enabled = false;
        }
    }
    // Remove entries that are present in the external source so they can be
    // replaced with fresh data. Entries absent from the external source are
    // kept (with enabled=false from above).
    store
        .servers
        .retain(|entry| entry.client != client || !imported_ids.contains(&entry.server_id));
    store.servers.extend(imported.clone());
    store.servers.sort_by(|a, b| {
        a.server_id
            .cmp(&b.server_id)
            .then_with(|| a.updated_at.cmp(&b.updated_at))
    });
    save_registry_store(&paths.mcp_registry_path, &store)?;

    Ok(imported.into_iter().map(|item| item.server_id).collect())
}

pub fn list_registry_servers(
    paths: &AppPaths,
    client: Option<Client>,
) -> Result<Vec<McpRegistryServer>, AppError> {
    let mut servers = load_registry_store(&paths.mcp_registry_path)?.servers;
    if let Some(client) = client {
        servers.retain(|server| server.client == client);
    }
    servers.sort_by(|a, b| a.server_id.cmp(&b.server_id));
    Ok(servers)
}

pub fn get_registry_server(
    paths: &AppPaths,
    server_id: &str,
) -> Result<Option<McpRegistryServer>, AppError> {
    let server = load_registry_store(&paths.mcp_registry_path)?
        .servers
        .into_iter()
        .find(|server| server.server_id == server_id);
    Ok(server)
}

fn parse_external_source(
    source_id: &str,
    client: Client,
    content: &str,
) -> Result<Vec<McpRegistryServer>, AppError> {
    match (source_id, client) {
        (CLAUDE_MCP_SOURCE_ID, Client::ClaudeCode) => parse_claude_source(content, source_id),
        (CODEX_MCP_SOURCE_ID, Client::Codex) => parse_codex_source(content, source_id),
        (CLAUDE_MCP_SOURCE_ID, Client::Codex) | (CODEX_MCP_SOURCE_ID, Client::ClaudeCode) => {
            Err(AppError::new(
                "VALIDATION_ERROR",
                format!("source_id/client mismatch: {source_id}"),
            ))
        }
        _ => Err(AppError::new(
            "VALIDATION_ERROR",
            format!("source is not MCP-compatible: {source_id}"),
        )),
    }
}

fn parse_claude_source(content: &str, source_id: &str) -> Result<Vec<McpRegistryServer>, AppError> {
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    let root: Value = serde_json::from_str(content)
        .map_err(|e| AppError::new("PARSE_ERROR", format!("parse claude mcp json: {e}")))?;
    let root_obj = root
        .as_object()
        .ok_or_else(|| AppError::new("PARSE_ERROR", "claude mcp json root must be an object"))?;
    let servers_item = root_obj.get("mcpServers");
    let Some(servers_item) = servers_item else {
        return Ok(Vec::new());
    };
    let servers_obj = servers_item.as_object().ok_or_else(|| {
        AppError::new(
            "PARSE_ERROR",
            "claude mcp json mcpServers must be an object",
        )
    })?;

    let updated_at = now_iso();
    let mut out = Vec::new();
    for (name, cfg) in servers_obj {
        let payload = cfg.as_object().cloned().ok_or_else(|| {
            AppError::new(
                "PARSE_ERROR",
                format!("claude server config must be object: {name}"),
            )
        })?;
        let enabled = payload
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        out.push(McpRegistryServer {
            server_id: format!("claude_code:{name}"),
            client: Client::ClaudeCode,
            name: name.to_string(),
            transport: claude_transport(&payload),
            enabled,
            payload,
            source_origin: source_id.to_string(),
            updated_at: updated_at.clone(),
        });
    }
    out.sort_by(|a, b| a.server_id.cmp(&b.server_id));
    Ok(out)
}

fn parse_codex_source(content: &str, source_id: &str) -> Result<Vec<McpRegistryServer>, AppError> {
    let doc = if content.trim().is_empty() {
        DocumentMut::new()
    } else {
        content
            .parse::<DocumentMut>()
            .map_err(|e| AppError::new("PARSE_ERROR", format!("parse codex mcp toml: {e}")))?
    };

    let table_item = doc.as_table().get("mcp_servers");
    let Some(table_item) = table_item else {
        return Ok(Vec::new());
    };
    let servers_table = table_item
        .as_table()
        .ok_or_else(|| AppError::new("PARSE_ERROR", "codex mcp_servers must be a table"))?;

    let updated_at = now_iso();
    let mut out = Vec::new();
    for (name, item) in servers_table.iter() {
        let server_table = item.as_table().ok_or_else(|| {
            AppError::new(
                "PARSE_ERROR",
                format!("codex server config must be table: {name}"),
            )
        })?;
        let payload = toml_table_to_json_map(server_table);
        let enabled = server_table
            .get("enabled")
            .and_then(|v| v.as_value())
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        out.push(McpRegistryServer {
            server_id: format!("codex:{name}"),
            client: Client::Codex,
            name: name.to_string(),
            transport: codex_transport(server_table),
            enabled,
            payload,
            source_origin: source_id.to_string(),
            updated_at: updated_at.clone(),
        });
    }
    out.sort_by(|a, b| a.server_id.cmp(&b.server_id));
    Ok(out)
}

pub fn load_registry_store(path: &Path) -> Result<McpRegistryStore, AppError> {
    let Some(raw) = read_to_string_opt(path)? else {
        return Ok(McpRegistryStore::default());
    };
    serde_json::from_str(&raw)
        .map_err(|e| AppError::new("PARSE_ERROR", format!("parse {}: {e}", path.display())))
}

pub fn save_registry_store(path: &Path, store: &McpRegistryStore) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::new("IO_ERROR", format!("mkdir {}: {e}", parent.display())))?;
    }
    let text = serde_json::to_string_pretty(store)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize mcp registry: {e}")))?;
    write_atomic(path, &text)
}

fn read_to_string_opt(path: &Path) -> Result<Option<String>, AppError> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::new(
            "IO_ERROR",
            format!("read {}: {e}", path.display()),
        )),
    }
}

fn write_atomic(path: &Path, content: &str) -> Result<(), AppError> {
    let parent = path.parent().ok_or_else(|| {
        AppError::new(
            "INTERNAL_ERROR",
            format!("registry path has no parent: {}", path.display()),
        )
    })?;

    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| {
        AppError::new(
            "IO_ERROR",
            format!("create temp file in {}: {e}", parent.display()),
        )
    })?;
    tmp.write_all(content.as_bytes()).map_err(|e| {
        AppError::new(
            "IO_ERROR",
            format!("write temp file in {}: {e}", parent.display()),
        )
    })?;
    tmp.flush().map_err(|e| {
        AppError::new(
            "IO_ERROR",
            format!("flush temp file in {}: {e}", parent.display()),
        )
    })?;

    let (_file, tmp_path) = tmp.keep().map_err(|e| {
        AppError::new(
            "IO_ERROR",
            format!("keep temp file in {}: {e}", parent.display()),
        )
    })?;
    drop(_file);

    #[cfg(windows)]
    {
        if path.exists() {
            fs::remove_file(path).map_err(|e| {
                AppError::new("IO_ERROR", format!("remove {}: {e}", path.display()))
            })?;
        }
    }

    fs::rename(&tmp_path, path).map_err(|e| {
        AppError::new(
            "IO_ERROR",
            format!("rename {} -> {}: {e}", tmp_path.display(), path.display()),
        )
    })?;

    Ok(())
}

fn codex_transport(table: &Table) -> Transport {
    if table
        .get("url")
        .and_then(|v| v.as_value())
        .and_then(|v| v.as_str())
        .is_some()
    {
        Transport::Http
    } else if table
        .get("command")
        .and_then(|v| v.as_value())
        .and_then(|v| v.as_str())
        .is_some()
    {
        Transport::Stdio
    } else {
        Transport::Unknown
    }
}

fn claude_transport(payload: &Map<String, Value>) -> Transport {
    if payload
        .get("type")
        .and_then(Value::as_str)
        .map(|v| v.eq_ignore_ascii_case("http"))
        .unwrap_or(false)
        || payload.get("url").is_some()
    {
        Transport::Http
    } else if payload.get("command").is_some() {
        Transport::Stdio
    } else {
        Transport::Unknown
    }
}

fn toml_table_to_json_map(table: &Table) -> Map<String, Value> {
    let mut map = Map::new();
    for (k, item) in table.iter() {
        map.insert(k.to_string(), toml_item_to_json(item));
    }
    map
}

fn toml_item_to_json(item: &Item) -> Value {
    if let Some(value) = item.as_value() {
        return toml_value_to_json(value);
    }
    if let Some(table) = item.as_table() {
        return Value::Object(toml_table_to_json_map(table));
    }
    if let Some(array_of_tables) = item.as_array_of_tables() {
        let values = array_of_tables
            .iter()
            .map(|table| Value::Object(toml_table_to_json_map(table)))
            .collect();
        return Value::Array(values);
    }
    Value::Null
}

fn toml_value_to_json(value: &TomlValue) -> Value {
    match value {
        TomlValue::String(s) => Value::String(s.value().to_string()),
        TomlValue::Integer(i) => Value::Number((*i.value()).into()),
        TomlValue::Float(f) => {
            Value::Number(serde_json::Number::from_f64(*f.value()).unwrap_or_else(|| 0.into()))
        }
        TomlValue::Boolean(b) => Value::Bool(*b.value()),
        TomlValue::Datetime(dt) => Value::String(dt.value().to_string()),
        TomlValue::Array(arr) => {
            let values = arr.iter().map(toml_value_to_json).collect();
            Value::Array(values)
        }
        TomlValue::InlineTable(inline_table) => {
            let mut map = Map::new();
            for (key, inline_value) in inline_table.iter() {
                map.insert(key.to_string(), toml_value_to_json(inline_value));
            }
            Value::Object(map)
        }
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}
