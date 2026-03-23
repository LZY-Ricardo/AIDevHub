use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde_json::Value;
use sha2::{Digest, Sha256};
use similar::TextDiff;
use thiserror::Error;
use toml_edit::{DocumentMut, Item, Table, Value as TomlValue};
use uuid::Uuid;

use crate::mcp_registry::{self, McpRegistryServer, McpRegistryStore};
use crate::model::*;

#[derive(Debug, Error)]
enum CoreError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("parse error: {0}")]
    Parse(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("internal error: {0}")]
    Internal(String),
    #[error("precondition failed")]
    PreconditionFailed { mismatches: Vec<FilePrecondition> },
}

impl From<CoreError> for AppError {
    fn from(value: CoreError) -> Self {
        match value {
            CoreError::Validation(msg) => AppError::new("VALIDATION_ERROR", msg),
            CoreError::NotFound(msg) => AppError::new("NOT_FOUND", msg),
            CoreError::Parse(msg) => AppError::new("PARSE_ERROR", msg),
            CoreError::Io(msg) => AppError::new("IO_ERROR", msg),
            CoreError::Internal(msg) => AppError::new("INTERNAL_ERROR", msg),
            CoreError::PreconditionFailed { mismatches } => AppError::new(
                "PRECONDITION_FAILED",
                "Target files changed since preview; please preview again.",
            )
            .with_details(serde_json::json!({ "mismatches": mismatches })),
        }
    }
}

impl From<AppError> for CoreError {
    fn from(value: AppError) -> Self {
        match value.code.as_str() {
            "VALIDATION_ERROR" => CoreError::Validation(value.message),
            "NOT_FOUND" => CoreError::NotFound(value.message),
            "PARSE_ERROR" => CoreError::Parse(value.message),
            "IO_ERROR" => CoreError::Io(value.message),
            "PRECONDITION_FAILED" => CoreError::Validation(value.message),
            _ => CoreError::Internal(value.message),
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub claude_config_path: PathBuf,
    pub claude_commands_dir: PathBuf,
    pub claude_commands_disabled_dir: PathBuf,
    pub codex_config_path: PathBuf,
    pub codex_skills_dir: PathBuf,
    pub codex_skills_disabled_dir: PathBuf,
    pub app_local_data_dir: PathBuf,
    pub profiles_path: PathBuf,
    pub mcp_notes_path: PathBuf,
    pub mcp_registry_path: PathBuf,
    pub disabled_pool_path: PathBuf,
    pub backups_dir: PathBuf,
    pub backup_index_path: PathBuf,
}

#[derive(Debug, Clone)]
struct PlannedFileWrite {
    path: PathBuf,
    before: Option<String>,
    after: String,
}

#[derive(Debug, Clone)]
struct PlannedMove {
    from: PathBuf,
    to: PathBuf,
    kind: SkillKind,
}

#[derive(Debug, Clone)]
struct PlannedWrite {
    files: Vec<PlannedFileWrite>,
    moves: Vec<PlannedMove>,
    expected_files: Vec<FilePrecondition>,
    summary: WriteSummary,
    warnings: Vec<Warning>,
    backup_op: BackupOp,
}

fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

fn read_to_string_opt(path: &Path) -> Result<Option<String>, CoreError> {
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(CoreError::Io(format!("read {}: {e}", path.display()))),
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), CoreError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| CoreError::Io(format!("mkdir {}: {e}", parent.display())))?;
    }
    Ok(())
}

fn write_atomic(path: &Path, content: &str) -> Result<(), CoreError> {
    ensure_parent_dir(path)?;
    let parent = path
        .parent()
        .ok_or_else(|| CoreError::Internal(format!("no parent dir: {}", path.display())))?;

    let mut tmp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| CoreError::Io(format!("create temp file: {e}")))?;
    tmp.write_all(content.as_bytes())
        .map_err(|e| CoreError::Io(format!("write temp file: {e}")))?;
    tmp.flush()
        .map_err(|e| CoreError::Io(format!("flush temp file: {e}")))?;

    // Cross-platform best-effort "atomic-ish" replace:
    // - Write a temp file in the same directory.
    // - Close it, then rename to target.
    // On Unix rename replaces; on Windows rename fails if destination exists, so we remove first.
    let (_file, tmp_path) = tmp
        .keep()
        .map_err(|e| CoreError::Io(format!("keep temp file: {e}")))?;
    drop(_file);

    #[cfg(windows)]
    {
        if path.exists() {
            fs::remove_file(path)
                .map_err(|e| CoreError::Io(format!("remove {}: {e}", path.display())))?;
        }
    }

    fs::rename(&tmp_path, path)
        .map_err(|e| CoreError::Io(format!("rename {} -> {}: {e}", tmp_path.display(), path.display())))?;
    Ok(())
}

fn unified_diff(path: &Path, before: &str, after: &str) -> String {
    let p = path.to_string_lossy();
    TextDiff::from_lines(before, after)
        .unified_diff()
        .context_radius(3)
        .header(p.as_ref(), p.as_ref())
        .to_string()
}

fn mask_payload(mut obj: serde_json::Map<String, Value>, reveal_secrets: bool) -> serde_json::Map<String, Value> {
    if reveal_secrets {
        return obj;
    }

    let mut mask_map_values = |k: &str| {
        if let Some(Value::Object(map)) = obj.get_mut(k) {
            for (_kk, vv) in map.iter_mut() {
                *vv = Value::String("***".to_string());
            }
        }
    };

    mask_map_values("env");
    mask_map_values("headers");

    for (k, v) in obj.iter_mut() {
        let lk = k.to_lowercase();
        if lk.contains("secret") || lk.contains("token") || lk.contains("password") {
            if lk.ends_with("_env_var") || lk.ends_with("_env_var_name") || lk.ends_with("_env_var_var") {
                continue;
            }
            if v.is_string() {
                *v = Value::String("***".to_string());
            }
        }
    }

    obj
}

fn server_id(client: Client, name: &str) -> String {
    match client {
        Client::ClaudeCode => format!("claude_code:{name}"),
        Client::Codex => format!("codex:{name}"),
    }
}

fn parse_server_id(id: &str) -> Result<(Client, String), CoreError> {
    let (c, name) = id
        .split_once(':')
        .ok_or_else(|| CoreError::Validation(format!("invalid server_id: {id}")))?;
    let client = match c {
        "claude_code" => Client::ClaudeCode,
        "codex" => Client::Codex,
        _ => return Err(CoreError::Validation(format!("invalid server_id client: {id}"))),
    };
    Ok((client, name.to_string()))
}

fn validate_simple_name(name: &str, label: &str) -> Result<(), CoreError> {
    if name.trim().is_empty() {
        return Err(CoreError::Validation(format!("{label} is required")));
    }
    if name != name.trim() {
        return Err(CoreError::Validation(format!("{label} must not have leading/trailing spaces")));
    }
    if name.contains('/') || name.contains('\\') {
        return Err(CoreError::Validation(format!("{label} must not contain path separators")));
    }
    if name == "." || name == ".." || name.contains("..") {
        return Err(CoreError::Validation(format!("{label} must not contain '..'")));
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err(CoreError::Validation(format!("{label} must not end with '.' or space")));
    }
    let forbidden = ['<', '>', '"', ':', '|', '?', '*'];
    if name.chars().any(|c| forbidden.contains(&c) || c.is_control()) {
        return Err(CoreError::Validation(format!("{label} contains invalid characters")));
    }
    Ok(())
}

fn file_precondition_from_disk(path: &Path) -> Result<FilePrecondition, CoreError> {
    let before = read_to_string_opt(path)?;
    Ok(FilePrecondition {
        path: path.to_string_lossy().to_string(),
        expected_before_sha256: before.as_deref().map(sha256_hex),
    })
}

fn strip_quotes(s: &str) -> String {
    let t = s.trim();
    if (t.starts_with('"') && t.ends_with('"')) || (t.starts_with('\'') && t.ends_with('\'')) {
        t[1..t.len().saturating_sub(1)].to_string()
    } else {
        t.to_string()
    }
}

fn parse_yaml_frontmatter(text: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let mut lines = text.lines();
    if lines.next().map(|l| l.trim()) != Some("---") {
        return out;
    }

    let mut fm_lines: Vec<String> = Vec::new();
    for line in lines.by_ref() {
        if line.trim() == "---" {
            break;
        }
        fm_lines.push(line.to_string());
    }

    let mut i = 0usize;
    while i < fm_lines.len() {
        let line = fm_lines[i].trim_end().to_string();
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            i += 1;
            continue;
        }

        let Some((k, v0)) = trimmed.split_once(':') else {
            i += 1;
            continue;
        };
        let key = k.trim().to_string();
        let mut val = v0.trim().to_string();

        // Handle simple block scalars: `key: |` or `key: >`
        if val.starts_with('|') || val.starts_with('>') {
            let mut block: Vec<String> = Vec::new();
            i += 1;
            while i < fm_lines.len() {
                let l = &fm_lines[i];
                if l.starts_with(' ') || l.starts_with('\t') {
                    block.push(l.trim_start().to_string());
                    i += 1;
                    continue;
                }
                break;
            }
            val = block.join("\n").trim().to_string();
            out.insert(key, val);
            continue;
        }

        out.insert(key, strip_quotes(&val));
        i += 1;
    }

    out
}

fn validate_preconditions(expected: &[FilePrecondition]) -> Result<(), CoreError> {
    let mut mismatches = Vec::new();
    for e in expected {
        let path = PathBuf::from(&e.path);
        let current = read_to_string_opt(&path)?;
        let current_sha = current.as_deref().map(sha256_hex);
        if current_sha != e.expected_before_sha256 {
            mismatches.push(e.clone());
        }
    }
    if mismatches.is_empty() {
        Ok(())
    } else {
        Err(CoreError::PreconditionFailed { mismatches })
    }
}

fn load_profiles(path: &Path) -> Result<Vec<Profile>, CoreError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else { return Ok(vec![]); };
    serde_json::from_str(&s).map_err(|e| CoreError::Parse(format!("parse {}: {e}", path.display())))
}

fn save_profiles(v: &[Profile]) -> Result<String, CoreError> {
    serde_json::to_string_pretty(v).map_err(|e| CoreError::Internal(format!("serialize profiles: {e}")))
}

fn load_mcp_notes(path: &Path) -> Result<BTreeMap<String, ServerNotes>, CoreError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else {
        return Ok(BTreeMap::new());
    };
    serde_json::from_str(&s).map_err(|e| CoreError::Parse(format!("parse {}: {e}", path.display())))
}

fn save_mcp_notes(v: &BTreeMap<String, ServerNotes>) -> Result<String, CoreError> {
    serde_json::to_string_pretty(v).map_err(|e| CoreError::Internal(format!("serialize mcp_notes: {e}")))
}

fn load_backup_index(path: &Path) -> Result<Vec<BackupRecord>, CoreError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else { return Ok(vec![]); };
    serde_json::from_str(&s).map_err(|e| CoreError::Parse(format!("parse {}: {e}", path.display())))
}

fn save_backup_index(v: &[BackupRecord]) -> Result<String, CoreError> {
    serde_json::to_string_pretty(v).map_err(|e| CoreError::Internal(format!("serialize backup_index: {e}")))
}

fn backup_file(backups_dir: &Path, target: &Path, op: BackupOp, summary: &str) -> Result<BackupRecord, CoreError> {
    fs::create_dir_all(backups_dir)
        .map_err(|e| CoreError::Io(format!("mkdir {}: {e}", backups_dir.display())))?;

    let before = read_to_string_opt(target)?;
    let Some(before) = before else {
        return Err(CoreError::NotFound(format!("backup target missing: {}", target.display())));
    };

    let ts = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let backup_id = Uuid::new_v4().to_string();
    let name_hash = sha256_hex(&target.to_string_lossy());
    let backup_path = backups_dir.join(format!("{ts}_{name_hash}_{backup_id}.bak"));

    write_atomic(&backup_path, &before)?;

    Ok(BackupRecord {
        backup_id,
        target_path: target.to_string_lossy().to_string(),
        backup_path: backup_path.to_string_lossy().to_string(),
        created_at: ts,
        op,
        summary: summary.to_string(),
    })
}

fn parse_claude_config(path: &Path) -> Result<(Value, serde_json::Map<String, Value>), CoreError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else {
        // default empty config
        let root = serde_json::json!({});
        return Ok((root, serde_json::Map::new()));
    };
    let root: Value =
        serde_json::from_str(&s).map_err(|e| CoreError::Parse(format!("parse {}: {e}", path.display())))?;
    let servers = root
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    Ok((root, servers))
}

fn write_claude_config(mut root: Value, servers: serde_json::Map<String, Value>) -> Result<String, CoreError> {
    if let Value::Object(map) = &mut root {
        if servers.is_empty() {
            map.remove("mcpServers");
        } else {
            map.insert("mcpServers".to_string(), Value::Object(servers));
        }
    } else {
        return Err(CoreError::Parse("claude config root is not JSON object".to_string()));
    }
    serde_json::to_string_pretty(&root).map_err(|e| CoreError::Internal(format!("serialize claude config: {e}")))
}

fn mcp_source_origin(client: Client) -> &'static str {
    match client {
        Client::ClaudeCode => "claudecode.mcp.json",
        Client::Codex => "codex.mcp.json",
    }
}

fn mcp_external_path(paths: &AppPaths, client: Client) -> &Path {
    match client {
        Client::ClaudeCode => &paths.claude_config_path,
        Client::Codex => &paths.codex_config_path,
    }
}

fn load_registry_store(paths: &AppPaths) -> Result<McpRegistryStore, CoreError> {
    mcp_registry::load_registry_store(&paths.mcp_registry_path).map_err(CoreError::from)
}

fn serialize_registry_store(store: &McpRegistryStore) -> Result<String, CoreError> {
    serde_json::to_string_pretty(store)
        .map_err(|e| CoreError::Internal(format!("serialize mcp registry: {e}")))
}

fn sort_registry_servers(store: &mut McpRegistryStore) {
    store
        .servers
        .sort_by(|a, b| a.server_id.cmp(&b.server_id).then_with(|| a.updated_at.cmp(&b.updated_at)));
}

fn enabled_from_payload(
    payload: &serde_json::Map<String, Value>,
    default_enabled: bool,
) -> Result<bool, CoreError> {
    match payload.get("enabled") {
        Some(Value::Bool(enabled)) => Ok(*enabled),
        Some(_) => Err(CoreError::Validation("enabled must be a boolean".to_string())),
        None => Ok(default_enabled),
    }
}

fn registry_payload_for_storage(
    client: Client,
    transport: Transport,
    mut payload: serde_json::Map<String, Value>,
    enabled: bool,
) -> serde_json::Map<String, Value> {
    match client {
        Client::ClaudeCode => {
            payload.remove("enabled");
            if transport == Transport::Http {
                payload
                    .entry("type".to_string())
                    .or_insert(Value::String("http".to_string()));
            }
        }
        Client::Codex => {
            payload.insert("enabled".to_string(), Value::Bool(enabled));
        }
    }
    payload
}

fn is_effectively_empty_external(client: Client, text: &str) -> bool {
    match client {
        Client::ClaudeCode => serde_json::from_str::<Value>(text)
            .ok()
            .and_then(|value| value.as_object().cloned())
            .map(|map| map.is_empty())
            .unwrap_or_else(|| text.trim().is_empty()),
        Client::Codex => text.trim().is_empty(),
    }
}

fn should_write_external(before: &Option<String>, after: &str, client: Client) -> bool {
    if before.is_none() && is_effectively_empty_external(client, after) {
        return false;
    }
    before.as_deref() != Some(after)
}

fn normalize_server_notes(notes: ServerNotes) -> ServerNotes {
    let description = notes.description.trim().to_string();
    let field_hints = notes
        .field_hints
        .into_iter()
        .filter_map(|(key, value)| {
            let key = key.trim();
            let value = value.trim();
            if key.is_empty() || value.is_empty() {
                None
            } else {
                Some((key.to_string(), value.to_string()))
            }
        })
        .collect();

    ServerNotes {
        description,
        field_hints,
    }
}

fn parse_codex_doc(path: &Path) -> Result<DocumentMut, CoreError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else {
        return Ok(DocumentMut::new());
    };
    s.parse::<DocumentMut>()
        .map_err(|e| CoreError::Parse(format!("parse {}: {e}", path.display())))
}

fn json_scalar_to_toml_value(value: &Value) -> Result<TomlValue, CoreError> {
    match value {
        Value::String(v) => Ok(toml_edit::value(v.clone()).into_value().unwrap()),
        Value::Bool(v) => Ok(toml_edit::value(*v).into_value().unwrap()),
        Value::Number(v) => {
            if let Some(i) = v.as_i64() {
                Ok(toml_edit::value(i).into_value().unwrap())
            } else if let Some(f) = v.as_f64() {
                Ok(toml_edit::value(f).into_value().unwrap())
            } else {
                Err(CoreError::Validation("unsupported numeric value".to_string()))
            }
        }
        Value::Array(items) => {
            let mut arr = toml_edit::Array::new();
            for item in items {
                arr.push(json_scalar_to_toml_value(item)?);
            }
            Ok(TomlValue::Array(arr))
        }
        Value::Null => Err(CoreError::Validation("null values are not supported in codex MCP".to_string())),
        Value::Object(_) => Err(CoreError::Validation(
            "nested object must be handled as a table when exporting codex MCP".to_string(),
        )),
    }
}

fn json_map_to_toml_table(map: &serde_json::Map<String, Value>) -> Result<Table, CoreError> {
    let mut table = Table::new();
    for (key, value) in map {
        match value {
            Value::Object(child) => {
                table.insert(key, Item::Table(json_map_to_toml_table(child)?));
            }
            Value::Null => {}
            _ => {
                table.insert(key, Item::Value(json_scalar_to_toml_value(value)?));
            }
        }
    }
    Ok(table)
}

fn export_claude_registry_config(paths: &AppPaths, store: &McpRegistryStore) -> Result<String, CoreError> {
    let (root, _) = parse_claude_config(&paths.claude_config_path)?;
    let mut servers = serde_json::Map::new();
    for server in store
        .servers
        .iter()
        .filter(|server| server.client == Client::ClaudeCode && server.enabled)
    {
        let mut payload = server.payload.clone();
        payload.remove("enabled");
        if server.transport == Transport::Http {
            payload
                .entry("type".to_string())
                .or_insert(Value::String("http".to_string()));
        }
        servers.insert(server.name.clone(), Value::Object(payload));
    }
    write_claude_config(root, servers)
}

fn export_codex_registry_config(paths: &AppPaths, store: &McpRegistryStore) -> Result<String, CoreError> {
    let mut doc = parse_codex_doc(&paths.codex_config_path)?;
    doc.as_table_mut().remove("mcp_servers");

    let mut servers = Table::new();
    for server in store
        .servers
        .iter()
        .filter(|server| server.client == Client::Codex && server.enabled)
    {
        let mut payload = server.payload.clone();
        payload.insert("enabled".to_string(), Value::Bool(true));
        servers.insert(&server.name, Item::Table(json_map_to_toml_table(&payload)?));
    }

    if !servers.is_empty() {
        doc["mcp_servers"] = Item::Table(servers);
    }

    Ok(doc.to_string())
}

fn export_registry_client_config(
    paths: &AppPaths,
    store: &McpRegistryStore,
    client: Client,
) -> Result<String, CoreError> {
    match client {
        Client::ClaudeCode => export_claude_registry_config(paths, store),
        Client::Codex => export_codex_registry_config(paths, store),
    }
}

fn payload_identity(payload: &serde_json::Map<String, Value>) -> String {
    if let Some(cmd) = payload.get("command").and_then(|v| v.as_str()) {
        let mut parts = vec![cmd.to_string()];
        if let Some(args) = payload.get("args").and_then(|v| v.as_array()) {
            for item in args {
                if let Some(value) = item.as_str() {
                    parts.push(value.to_string());
                }
            }
        }
        return parts.join(" ");
    }
    if let Some(url) = payload.get("url").and_then(|v| v.as_str()) {
        return url.to_string();
    }
    "unknown".to_string()
}

fn to_server_record_registry(paths: &AppPaths, server: McpRegistryServer, reveal: bool) -> ServerRecord {
    let payload = mask_payload(server.payload.clone(), reveal);
    ServerRecord {
        server_id: server.server_id,
        name: server.name,
        client: server.client,
        transport: server.transport,
        enabled: server.enabled,
        source_file: paths.mcp_registry_path.to_string_lossy().to_string(),
        identity: payload_identity(&server.payload),
        payload,
    }
}

fn server_field_meta(client: Client, transport: Transport) -> ServerFieldMeta {
    let (known_fields, readonly_fields) = match (client, transport) {
        (Client::ClaudeCode, Transport::Stdio) => (
            vec!["command", "args", "env"],
            Vec::<&str>::new(),
        ),
        (Client::ClaudeCode, Transport::Http) => (
            vec!["type", "url", "headers"],
            vec!["type"],
        ),
        (Client::Codex, Transport::Stdio) => (
            vec!["command", "args", "enabled"],
            Vec::<&str>::new(),
        ),
        (Client::Codex, Transport::Http) => (
            vec!["url", "bearer_token_env_var", "enabled"],
            Vec::<&str>::new(),
        ),
        (_, Transport::Unknown) => (Vec::<&str>::new(), Vec::<&str>::new()),
    };

    ServerFieldMeta {
        known_fields: known_fields.iter().map(|field| (*field).to_string()).collect(),
        secret_fields: ["env", "headers"]
            .iter()
            .map(|field| (*field).to_string())
            .collect(),
        readonly_fields: readonly_fields
            .iter()
            .map(|field| (*field).to_string())
            .collect(),
        available_fields: known_fields.iter().map(|field| (*field).to_string()).collect(),
    }
}

pub fn runtime_get_info(paths: &AppPaths) -> Result<RuntimeGetInfoResponse, AppError> {
    let exists = RuntimeExists {
        claude_config: paths.claude_config_path.exists(),
        codex_config: paths.codex_config_path.exists(),
    };
    let resp = RuntimeGetInfoResponse {
        paths: RuntimePaths {
            claude_config_path: paths.claude_config_path.to_string_lossy().to_string(),
            claude_commands_dir: paths.claude_commands_dir.to_string_lossy().to_string(),
            claude_commands_disabled_dir: paths
                .claude_commands_disabled_dir
                .to_string_lossy()
                .to_string(),
            codex_config_path: paths.codex_config_path.to_string_lossy().to_string(),
            codex_skills_dir: paths.codex_skills_dir.to_string_lossy().to_string(),
            codex_skills_disabled_dir: paths.codex_skills_disabled_dir.to_string_lossy().to_string(),
            app_local_data_dir: paths.app_local_data_dir.to_string_lossy().to_string(),
            profiles_path: paths.profiles_path.to_string_lossy().to_string(),
            disabled_pool_path: paths.disabled_pool_path.to_string_lossy().to_string(),
            backups_dir: paths.backups_dir.to_string_lossy().to_string(),
            backup_index_path: paths.backup_index_path.to_string_lossy().to_string(),
        },
        exists,
    };
    Ok(resp)
}

pub fn server_list(paths: &AppPaths, client: Option<Client>) -> Result<Vec<ServerRecord>, AppError> {
    let servers = mcp_registry::list_registry_servers(paths, client)?;
    Ok(servers
        .into_iter()
        .map(|server| to_server_record_registry(paths, server, false))
        .collect())
}

pub fn server_get(paths: &AppPaths, server_id_str: &str, reveal: bool) -> Result<ServerRecord, AppError> {
    parse_server_id(server_id_str).map_err(AppError::from)?;
    let server = mcp_registry::get_registry_server(paths, server_id_str)?
        .ok_or_else(|| AppError::new("NOT_FOUND", format!("server not found: {server_id_str}")))?;
    Ok(to_server_record_registry(paths, server, reveal))
}

pub fn server_get_edit_session(paths: &AppPaths, server_id_str: &str) -> Result<ServerEditSession, AppError> {
    let record = server_get(paths, server_id_str, true)?;
    let field_meta = server_field_meta(record.client, record.transport);
    let mut unknown_fields = record
        .payload
        .keys()
        .filter(|key| !field_meta.known_fields.iter().any(|known| known == *key))
        .cloned()
        .collect::<Vec<_>>();
    unknown_fields.sort();

    Ok(ServerEditSession {
        server_id: record.server_id,
        client: record.client,
        transport: record.transport,
        source_file: record.source_file,
        editable_payload: record.payload.clone(),
        raw_fragment_json: record.payload,
        unknown_fields,
        field_meta,
    })
}

pub fn mcp_notes_get(paths: &AppPaths, server_id_str: &str) -> Result<ServerNotes, AppError> {
    parse_server_id(server_id_str).map_err(AppError::from)?;
    let all = load_mcp_notes(&paths.mcp_notes_path).map_err(AppError::from)?;
    Ok(all.get(server_id_str).cloned().unwrap_or_default())
}

pub fn mcp_notes_put(paths: &AppPaths, server_id_str: &str, notes: ServerNotes) -> Result<ServerNotes, AppError> {
    parse_server_id(server_id_str).map_err(AppError::from)?;
    let mut all = load_mcp_notes(&paths.mcp_notes_path).map_err(AppError::from)?;
    let normalized = normalize_server_notes(notes);

    if normalized.description.is_empty() && normalized.field_hints.is_empty() {
        all.remove(server_id_str);
    } else {
        all.insert(server_id_str.to_string(), normalized.clone());
    }

    let serialized = save_mcp_notes(&all).map_err(AppError::from)?;
    write_atomic(&paths.mcp_notes_path, &serialized).map_err(AppError::from)?;
    Ok(normalized)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SkillListFilter {
    All,
    User,
    System,
    Disabled,
}

fn parse_skill_list_filter(scope: Option<&str>) -> SkillListFilter {
    match scope.unwrap_or("all") {
        "user" => SkillListFilter::User,
        "system" => SkillListFilter::System,
        "disabled" => SkillListFilter::Disabled,
        _ => SkillListFilter::All,
    }
}

fn skill_filter_match(filter: SkillListFilter, rec: &SkillRecord) -> bool {
    match filter {
        SkillListFilter::All => true,
        SkillListFilter::User => rec.scope == SkillScope::User,
        SkillListFilter::System => rec.scope == SkillScope::System,
        SkillListFilter::Disabled => !rec.enabled,
    }
}

fn read_dir_entries(path: &Path) -> Result<Vec<fs::DirEntry>, CoreError> {
    let rd = match fs::read_dir(path) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(CoreError::Io(format!("read_dir {}: {e}", path.display()))),
    };
    let mut out = Vec::new();
    for ent in rd {
        let ent = ent.map_err(|e| CoreError::Io(format!("read_dir {}: {e}", path.display())))?;
        out.push(ent);
    }
    Ok(out)
}

fn build_skill_record_codex(
    id_name: &str,
    dir_path: &Path,
    enabled: bool,
    scope: SkillScope,
) -> Result<(SkillRecord, String), CoreError> {
    let entry_path = dir_path.join("SKILL.md");
    let Some(content) = read_to_string_opt(&entry_path)? else {
        return Err(CoreError::NotFound(format!("missing SKILL.md: {}", entry_path.display())));
    };
    let fm = parse_yaml_frontmatter(&content);
    let fallback = dir_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(id_name)
        .to_string();
    let name = fm.get("name").cloned().unwrap_or(fallback);
    let description = fm.get("description").cloned().unwrap_or_default();
    Ok((
        SkillRecord {
            skill_id: server_id(Client::Codex, id_name),
            client: Client::Codex,
            name,
            description,
            scope,
            kind: SkillKind::Dir,
            enabled,
            entry_path: entry_path.to_string_lossy().to_string(),
            container_path: dir_path.to_string_lossy().to_string(),
        },
        content,
    ))
}

fn build_skill_record_claude(
    command_name: &str,
    file_path: &Path,
    enabled: bool,
) -> Result<(SkillRecord, String), CoreError> {
    let Some(content) = read_to_string_opt(file_path)? else {
        return Err(CoreError::NotFound(format!("missing command file: {}", file_path.display())));
    };
    let fm = parse_yaml_frontmatter(&content);
    let description = fm.get("description").cloned().unwrap_or_default();
    Ok((
        SkillRecord {
            skill_id: server_id(Client::ClaudeCode, command_name),
            client: Client::ClaudeCode,
            name: command_name.to_string(),
            description,
            scope: SkillScope::User,
            kind: SkillKind::File,
            enabled,
            entry_path: file_path.to_string_lossy().to_string(),
            container_path: file_path
                .parent()
                .unwrap_or_else(|| Path::new(""))
                .to_string_lossy()
                .to_string(),
        },
        content,
    ))
}

pub fn skill_list(
    paths: &AppPaths,
    client: Option<Client>,
    scope: Option<String>,
) -> Result<Vec<SkillRecord>, AppError> {
    let filter = parse_skill_list_filter(scope.as_deref());
    let mut out: Vec<SkillRecord> = Vec::new();

    if client.is_none() || client == Some(Client::ClaudeCode) {
        // enabled personal commands
        for ent in read_dir_entries(&paths.claude_commands_dir).map_err(AppError::from)? {
            let Ok(ft) = ent.file_type() else { continue };
            if !ft.is_file() {
                continue;
            }
            let p = ent.path();
            if p.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }
            let Some(stem) = p.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if let Ok((rec, _content)) = build_skill_record_claude(stem, &p, true) {
                if skill_filter_match(filter, &rec) {
                    out.push(rec);
                }
            }
        }

        // disabled personal commands
        for ent in read_dir_entries(&paths.claude_commands_disabled_dir).map_err(AppError::from)? {
            let Ok(ft) = ent.file_type() else { continue };
            if !ft.is_file() {
                continue;
            }
            let p = ent.path();
            if p.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }
            let Some(stem) = p.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if let Ok((rec, _content)) = build_skill_record_claude(stem, &p, false) {
                if skill_filter_match(filter, &rec) {
                    out.push(rec);
                }
            }
        }
    }

    if client.is_none() || client == Some(Client::Codex) {
        // enabled user skills (exclude .system)
        for ent in read_dir_entries(&paths.codex_skills_dir).map_err(AppError::from)? {
            let Ok(ft) = ent.file_type() else { continue };
            if !ft.is_dir() {
                continue;
            }
            let p = ent.path();
            let Some(dir_name) = p.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            if dir_name == ".system" {
                continue;
            }
            let entry = p.join("SKILL.md");
            if !entry.exists() {
                continue;
            }
            if let Ok((rec, _content)) = build_skill_record_codex(dir_name, &p, true, SkillScope::User) {
                if skill_filter_match(filter, &rec) {
                    out.push(rec);
                }
            }
        }

        // system skills under .system
        let system_root = paths.codex_skills_dir.join(".system");
        for ent in read_dir_entries(&system_root).map_err(AppError::from)? {
            let Ok(ft) = ent.file_type() else { continue };
            if !ft.is_dir() {
                continue;
            }
            let p = ent.path();
            let Some(dir_name) = p.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            let id_name = format!(".system/{dir_name}");
            let entry = p.join("SKILL.md");
            if !entry.exists() {
                continue;
            }
            if let Ok((rec, _content)) = build_skill_record_codex(&id_name, &p, true, SkillScope::System) {
                if skill_filter_match(filter, &rec) {
                    out.push(rec);
                }
            }
        }

        // disabled user skills
        for ent in read_dir_entries(&paths.codex_skills_disabled_dir).map_err(AppError::from)? {
            let Ok(ft) = ent.file_type() else { continue };
            if !ft.is_dir() {
                continue;
            }
            let p = ent.path();
            let Some(dir_name) = p.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            let entry = p.join("SKILL.md");
            if !entry.exists() {
                continue;
            }
            if let Ok((rec, _content)) = build_skill_record_codex(dir_name, &p, false, SkillScope::User) {
                if skill_filter_match(filter, &rec) {
                    out.push(rec);
                }
            }
        }
    }

    out.sort_by(|a, b| {
        (
            format!("{:?}", a.client),
            a.scope as u8,
            (!a.enabled) as u8,
            a.skill_id.clone(),
        )
            .cmp(&(
                format!("{:?}", b.client),
                b.scope as u8,
                (!b.enabled) as u8,
                b.skill_id.clone(),
            ))
    });

    Ok(out)
}

pub fn skill_get(paths: &AppPaths, skill_id_str: &str) -> Result<SkillGetResponse, AppError> {
    let (client, name) = parse_server_id(skill_id_str).map_err(AppError::from)?;

    let (record, content) = match client {
        Client::ClaudeCode => {
            let enabled_path = paths.claude_commands_dir.join(format!("{name}.md"));
            let disabled_path = paths.claude_commands_disabled_dir.join(format!("{name}.md"));
            if enabled_path.exists() {
                build_skill_record_claude(&name, &enabled_path, true).map_err(AppError::from)?
            } else if disabled_path.exists() {
                build_skill_record_claude(&name, &disabled_path, false).map_err(AppError::from)?
            } else {
                return Err(AppError::new("NOT_FOUND", format!("skill not found: {skill_id_str}")));
            }
        }
        Client::Codex => {
            if name.starts_with(".system/") {
                let dir = paths.codex_skills_dir.join(&name);
                if !dir.exists() {
                    return Err(AppError::new("NOT_FOUND", format!("skill not found: {skill_id_str}")));
                }
                build_skill_record_codex(&name, &dir, true, SkillScope::System).map_err(AppError::from)?
            } else {
                let enabled_dir = paths.codex_skills_dir.join(&name);
                let disabled_dir = paths.codex_skills_disabled_dir.join(&name);
                if enabled_dir.exists() {
                    build_skill_record_codex(&name, &enabled_dir, true, SkillScope::User).map_err(AppError::from)?
                } else if disabled_dir.exists() {
                    build_skill_record_codex(&name, &disabled_dir, false, SkillScope::User).map_err(AppError::from)?
                } else {
                    return Err(AppError::new("NOT_FOUND", format!("skill not found: {skill_id_str}")));
                }
            }
        }
    };

    Ok(SkillGetResponse { record, content })
}

fn plan_create_skill(
    paths: &AppPaths,
    client: Client,
    name: &str,
    description: &str,
    body: Option<String>,
) -> Result<PlannedWrite, CoreError> {
    validate_simple_name(name, "name")?;
    if description.trim().is_empty() {
        return Err(CoreError::Validation("description is required".to_string()));
    }

    let mut planned = PlannedWrite {
        files: vec![],
        moves: vec![],
        expected_files: vec![],
        summary: WriteSummary::default(),
        warnings: vec![],
        backup_op: BackupOp::AddServer, // no backups for skills; value is unused
    };

    match client {
        Client::Codex => {
            if name == ".system" || name.starts_with(".system/") {
                return Err(CoreError::Validation("'.system' is reserved".to_string()));
            }
            let dir_enabled = paths.codex_skills_dir.join(name);
            let dir_disabled = paths.codex_skills_disabled_dir.join(name);
            if dir_enabled.exists() || dir_disabled.exists() {
                return Err(CoreError::Validation(format!("skill already exists: {name}")));
            }
            let entry = dir_enabled.join("SKILL.md");
            let body_text = body.unwrap_or_else(|| {
                "## Instructions\n\n- 在这里写下该技能的触发条件与执行步骤。\n".to_string()
            });
            let content = format!(
                "---\nname: {name}\ndescription: {desc}\n---\n\n# {name}\n\n{body_text}",
                desc = description.trim()
            );

            planned.summary.will_add.push(server_id(client, name));
            planned.summary.will_enable.push(server_id(client, name));
            planned.files.push(PlannedFileWrite {
                path: entry,
                before: None,
                after: content,
            });
        }
        Client::ClaudeCode => {
            let file_enabled = paths.claude_commands_dir.join(format!("{name}.md"));
            let file_disabled = paths.claude_commands_disabled_dir.join(format!("{name}.md"));
            if file_enabled.exists() || file_disabled.exists() {
                return Err(CoreError::Validation(format!("command already exists: {name}")));
            }

            let body_text = body.unwrap_or_else(|| {
                "## Instructions\n\n- 在这里写下该命令要执行的动作、参数说明与注意事项。\n".to_string()
            });
            let content = format!(
                "---\ndescription: \"{desc}\"\n---\n\n# /{name}\n\n{body_text}",
                desc = description.trim().replace('"', "\\\"")
            );

            planned.summary.will_add.push(server_id(client, name));
            planned.summary.will_enable.push(server_id(client, name));
            planned.files.push(PlannedFileWrite {
                path: file_enabled,
                before: None,
                after: content,
            });
        }
    }

    Ok(planned)
}

fn plan_toggle_skill(paths: &AppPaths, skill_id_str: &str, enabled: bool) -> Result<PlannedWrite, CoreError> {
    let (client, name) = parse_server_id(skill_id_str)?;
    let mut planned = PlannedWrite {
        files: vec![],
        moves: vec![],
        expected_files: vec![],
        summary: WriteSummary::default(),
        warnings: vec![],
        backup_op: BackupOp::Toggle, // no backups for skills; value is unused
    };

    match client {
        Client::Codex => {
            if name == ".system" || name.starts_with(".system/") {
                return Err(CoreError::Validation("system skills cannot be toggled".to_string()));
            }

            let enabled_dir = paths.codex_skills_dir.join(&name);
            let disabled_dir = paths.codex_skills_disabled_dir.join(&name);
            let exists_enabled = enabled_dir.exists();
            let exists_disabled = disabled_dir.exists();
            if exists_enabled && exists_disabled {
                return Err(CoreError::Validation(format!(
                    "skill exists in both enabled/disabled locations: {skill_id_str}"
                )));
            }

            let currently_enabled = exists_enabled;
            if currently_enabled == enabled {
                return Ok(planned);
            }

            let (from, to) = if enabled {
                (disabled_dir, enabled_dir)
            } else {
                (enabled_dir, disabled_dir)
            };

            let entry_from = from.join("SKILL.md");
            if !entry_from.exists() {
                return Err(CoreError::NotFound(format!("missing SKILL.md: {}", entry_from.display())));
            }

            planned.expected_files.push(file_precondition_from_disk(&entry_from)?);
            planned.moves.push(PlannedMove {
                from,
                to,
                kind: SkillKind::Dir,
            });
        }
        Client::ClaudeCode => {
            let enabled_path = paths.claude_commands_dir.join(format!("{name}.md"));
            let disabled_path = paths.claude_commands_disabled_dir.join(format!("{name}.md"));
            let exists_enabled = enabled_path.exists();
            let exists_disabled = disabled_path.exists();
            if exists_enabled && exists_disabled {
                return Err(CoreError::Validation(format!(
                    "command exists in both enabled/disabled locations: {skill_id_str}"
                )));
            }

            let currently_enabled = exists_enabled;
            if currently_enabled == enabled {
                return Ok(planned);
            }

            let (from, to) = if enabled {
                (disabled_path, enabled_path)
            } else {
                (enabled_path, disabled_path)
            };

            if !from.exists() {
                return Err(CoreError::NotFound(format!("command file missing: {}", from.display())));
            }

            planned.expected_files.push(file_precondition_from_disk(&from)?);
            planned.moves.push(PlannedMove {
                from,
                to,
                kind: SkillKind::File,
            });
        }
    }

    if enabled {
        planned.summary.will_enable.push(skill_id_str.to_string());
    } else {
        planned.summary.will_disable.push(skill_id_str.to_string());
    }

    Ok(planned)
}

pub fn skill_preview_create(
    paths: &AppPaths,
    client: Client,
    name: &str,
    description: &str,
    body: Option<String>,
) -> Result<WritePreview, AppError> {
    let planned = plan_create_skill(paths, client, name, description, body).map_err(AppError::from)?;
    build_preview(planned).map_err(AppError::from)
}

pub fn skill_apply_create(
    paths: &AppPaths,
    client: Client,
    name: &str,
    description: &str,
    body: Option<String>,
    expected: Vec<FilePrecondition>,
) -> Result<ApplyResult, AppError> {
    let planned = plan_create_skill(paths, client, name, description, body).map_err(AppError::from)?;
    apply_planned(paths, planned, &expected).map_err(AppError::from)
}

pub fn skill_preview_toggle(paths: &AppPaths, skill_id_str: &str, enabled: bool) -> Result<WritePreview, AppError> {
    let planned = plan_toggle_skill(paths, skill_id_str, enabled).map_err(AppError::from)?;
    build_preview(planned).map_err(AppError::from)
}

pub fn skill_apply_toggle(
    paths: &AppPaths,
    skill_id_str: &str,
    enabled: bool,
    expected: Vec<FilePrecondition>,
) -> Result<ApplyResult, AppError> {
    let planned = plan_toggle_skill(paths, skill_id_str, enabled).map_err(AppError::from)?;
    apply_planned(paths, planned, &expected).map_err(AppError::from)
}

fn plan_toggle(paths: &AppPaths, server_id_str: &str, enabled: bool) -> Result<PlannedWrite, CoreError> {
    let (client, name) = parse_server_id(server_id_str)?;
    let mut planned = PlannedWrite {
        files: vec![],
        moves: vec![],
        expected_files: vec![],
        summary: WriteSummary::default(),
        warnings: vec![],
        backup_op: BackupOp::Toggle,
    };

    let mut store = load_registry_store(paths)?;
    let Some(server) = store
        .servers
        .iter_mut()
        .find(|server| server.server_id == server_id_str)
    else {
        return Err(CoreError::NotFound(format!("server not found: {server_id_str}")));
    };

    if server.client != client || server.name != name {
        return Err(CoreError::Validation(format!("server_id/client mismatch: {server_id_str}")));
    }
    if server.enabled == enabled {
        return Ok(planned);
    }

    server.enabled = enabled;
    server.updated_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    server.payload = registry_payload_for_storage(client, server.transport, server.payload.clone(), enabled);
    sort_registry_servers(&mut store);

    let before_registry = read_to_string_opt(&paths.mcp_registry_path)?;
    let after_registry = serialize_registry_store(&store)?;
    planned.files.push(PlannedFileWrite {
        path: paths.mcp_registry_path.clone(),
        before: before_registry,
        after: after_registry,
    });

    let external_path = mcp_external_path(paths, client).to_path_buf();
    let before_external = read_to_string_opt(&external_path)?;
    let after_external = export_registry_client_config(paths, &store, client)?;
    if should_write_external(&before_external, &after_external, client) {
        planned.files.push(PlannedFileWrite {
            path: external_path,
            before: before_external,
            after: after_external,
        });
    }

    if enabled {
        planned.summary.will_enable.push(server_id_str.to_string());
    } else {
        planned.summary.will_disable.push(server_id_str.to_string());
    }

    Ok(planned)
}

fn plan_add_server(
    paths: &AppPaths,
    client: Client,
    name: &str,
    transport: Transport,
    config: serde_json::Map<String, Value>,
) -> Result<PlannedWrite, CoreError> {
    if name.trim().is_empty() {
        return Err(CoreError::Validation("name is required".to_string()));
    }
    let mut planned = PlannedWrite {
        files: vec![],
        moves: vec![],
        expected_files: vec![],
        summary: WriteSummary::default(),
        warnings: vec![],
        backup_op: BackupOp::AddServer,
    };

    let requested_enabled = enabled_from_payload(&config, true)?;
    let normalized = normalize_server_payload(client, transport, config)?;
    let sid = server_id(client, name);

    let mut store = load_registry_store(paths)?;
    if store
        .servers
        .iter()
        .any(|server| server.client == client && server.name == name)
    {
        return Err(CoreError::Validation(format!("server already exists: {name}")));
    }

    store.servers.push(McpRegistryServer {
        server_id: sid.clone(),
        client,
        name: name.to_string(),
        transport,
        enabled: requested_enabled,
        payload: registry_payload_for_storage(client, transport, normalized, requested_enabled),
        source_origin: mcp_source_origin(client).to_string(),
        updated_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    });
    sort_registry_servers(&mut store);

    let before_registry = read_to_string_opt(&paths.mcp_registry_path)?;
    let after_registry = serialize_registry_store(&store)?;
    planned.files.push(PlannedFileWrite {
        path: paths.mcp_registry_path.clone(),
        before: before_registry,
        after: after_registry,
    });

    let external_path = mcp_external_path(paths, client).to_path_buf();
    let before_external = read_to_string_opt(&external_path)?;
    let after_external = export_registry_client_config(paths, &store, client)?;
    if should_write_external(&before_external, &after_external, client) {
        planned.files.push(PlannedFileWrite {
            path: external_path,
            before: before_external,
            after: after_external,
        });
    }

    planned.summary.will_add.push(sid.clone());
    if requested_enabled {
        planned.summary.will_enable.push(sid);
    }

    Ok(planned)
}

fn ensure_string_array(payload: &serde_json::Map<String, Value>, key: &str) -> Result<(), CoreError> {
    let Some(value) = payload.get(key) else {
        return Ok(());
    };
    let Some(items) = value.as_array() else {
        return Err(CoreError::Validation(format!("{key} must be an array of strings")));
    };
    if items.iter().all(|item| item.as_str().is_some()) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!("{key} must be an array of strings")))
    }
}

fn ensure_string_map(payload: &serde_json::Map<String, Value>, key: &str) -> Result<(), CoreError> {
    let Some(value) = payload.get(key) else {
        return Ok(());
    };
    let Some(map) = value.as_object() else {
        return Err(CoreError::Validation(format!("{key} must be an object of strings")));
    };
    if map.values().all(|item| item.as_str().is_some()) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!("{key} must be an object of strings")))
    }
}

fn require_non_empty_string(payload: &serde_json::Map<String, Value>, key: &str) -> Result<(), CoreError> {
    let value = payload
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if value.is_some() {
        Ok(())
    } else {
        Err(CoreError::Validation(format!("{key} is required")))
    }
}

fn normalize_server_payload(
    client: Client,
    transport: Transport,
    mut payload: serde_json::Map<String, Value>,
) -> Result<serde_json::Map<String, Value>, CoreError> {
    match transport {
        Transport::Stdio => {
            require_non_empty_string(&payload, "command")?;
            ensure_string_array(&payload, "args")?;
            ensure_string_map(&payload, "env")?;
            if let Some(Value::String(command)) = payload.get_mut("command") {
                *command = command.trim().to_string();
            }
        }
        Transport::Http => {
            require_non_empty_string(&payload, "url")?;
            if let Some(Value::String(url)) = payload.get_mut("url") {
                *url = url.trim().to_string();
            }
            match client {
                Client::ClaudeCode => {
                    ensure_string_map(&payload, "headers")?;
                    payload.insert("type".to_string(), Value::String("http".to_string()));
                }
                Client::Codex => {
                    if let Some(value) = payload.get("bearer_token_env_var") {
                        if value.as_str().map(str::trim).filter(|value| !value.is_empty()).is_none() {
                            return Err(CoreError::Validation(
                                "bearer_token_env_var must be a non-empty string".to_string(),
                            ));
                        }
                    }
                }
            }
        }
        Transport::Unknown => {
            return Err(CoreError::Validation("transport cannot be unknown".to_string()));
        }
    }

    if client == Client::ClaudeCode {
        payload.remove("enabled");
    }

    Ok(payload)
}

fn plan_edit_server(paths: &AppPaths, server_id_str: &str, draft: ServerEditDraft) -> Result<PlannedWrite, CoreError> {
    let (client, name) = parse_server_id(server_id_str)?;
    let mut planned = PlannedWrite {
        files: vec![],
        moves: vec![],
        expected_files: vec![],
        summary: WriteSummary::default(),
        warnings: vec![],
        backup_op: BackupOp::EditServer,
    };

    let mut store = load_registry_store(paths)?;
    let Some(server) = store
        .servers
        .iter_mut()
        .find(|server| server.server_id == server_id_str)
    else {
        return Err(CoreError::NotFound(format!("server not found: {server_id_str}")));
    };

    if server.client != client || server.name != name {
        return Err(CoreError::Validation(format!("server_id/client mismatch: {server_id_str}")));
    }
    if server.transport != draft.transport {
        return Err(CoreError::Validation("transport cannot change".to_string()));
    }

    let requested_enabled = enabled_from_payload(&draft.payload, server.enabled)?;
    let normalized = normalize_server_payload(client, draft.transport, draft.payload)?;
    let previous_enabled = server.enabled;
    server.enabled = requested_enabled;
    server.updated_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    server.payload = registry_payload_for_storage(client, draft.transport, normalized, requested_enabled);
    sort_registry_servers(&mut store);

    let before_registry = read_to_string_opt(&paths.mcp_registry_path)?;
    let after_registry = serialize_registry_store(&store)?;
    planned.files.push(PlannedFileWrite {
        path: paths.mcp_registry_path.clone(),
        before: before_registry,
        after: after_registry,
    });

    let external_path = mcp_external_path(paths, client).to_path_buf();
    let before_external = read_to_string_opt(&external_path)?;
    let after_external = export_registry_client_config(paths, &store, client)?;
    if should_write_external(&before_external, &after_external, client) {
        planned.files.push(PlannedFileWrite {
            path: external_path,
            before: before_external,
            after: after_external,
        });
    }

    if previous_enabled != requested_enabled {
        if requested_enabled {
            planned.summary.will_enable.push(server_id_str.to_string());
        } else {
            planned.summary.will_disable.push(server_id_str.to_string());
        }
    }

    Ok(planned)
}

fn build_preview(planned: PlannedWrite) -> Result<WritePreview, CoreError> {
    let mut files = Vec::new();
    let mut expected_map: BTreeMap<String, Option<String>> = BTreeMap::new();
    for p in &planned.expected_files {
        expected_map.insert(p.path.clone(), p.expected_before_sha256.clone());
    }

    for f in &planned.files {
        let before = f.before.clone().unwrap_or_default();
        let after = f.after.clone();
        let will_create = f.before.is_none();
        let before_sha = f.before.as_deref().map(sha256_hex);
        let after_sha = sha256_hex(&after);
        let diff = unified_diff(&f.path, &before, &after);
        let path_str = f.path.to_string_lossy().to_string();
        expected_map.insert(path_str.clone(), before_sha.clone());
        files.push(FileChangePreview {
            path: path_str,
            will_create,
            before_sha256: before_sha,
            after_sha256: after_sha,
            diff_unified: diff,
        });
    }

    let moves = planned
        .moves
        .iter()
        .map(|m| MovePreview {
            from: m.from.to_string_lossy().to_string(),
            to: m.to.to_string_lossy().to_string(),
            kind: m.kind,
        })
        .collect::<Vec<_>>();

    let expected_files = expected_map
        .into_iter()
        .map(|(path, expected_before_sha256)| FilePrecondition {
            path,
            expected_before_sha256,
        })
        .collect::<Vec<_>>();

    Ok(WritePreview {
        files,
        moves,
        expected_files,
        summary: planned.summary,
        warnings: planned.warnings,
    })
}

fn apply_planned(paths: &AppPaths, planned: PlannedWrite, expected: &[FilePrecondition]) -> Result<ApplyResult, CoreError> {
    validate_preconditions(expected)?;

    let mut backups = Vec::new();
    // Backup only user config files, not app storage.
    for f in &planned.files {
        let is_user_config = f.path == paths.claude_config_path || f.path == paths.codex_config_path;
        if is_user_config && f.before.is_some() {
            let rec = backup_file(&paths.backups_dir, &f.path, planned.backup_op.clone(), "auto backup")?;
            backups.push(rec);
        }
    }

    for m in &planned.moves {
        if !m.from.exists() {
            return Err(CoreError::NotFound(format!("move source missing: {}", m.from.display())));
        }
        if m.to.exists() {
            return Err(CoreError::Validation(format!(
                "move destination already exists: {}",
                m.to.display()
            )));
        }
        ensure_parent_dir(&m.to)?;
        fs::rename(&m.from, &m.to)
            .map_err(|e| CoreError::Io(format!("rename {} -> {}: {e}", m.from.display(), m.to.display())))?;
    }

    for f in &planned.files {
        write_atomic(&f.path, &f.after)?;
    }

    // Update backup index best-effort (do not precondition guard).
    if !backups.is_empty() {
        let mut index = load_backup_index(&paths.backup_index_path).unwrap_or_default();
        index.extend(backups.clone());
        let s = save_backup_index(&index)?;
        let _ = write_atomic(&paths.backup_index_path, &s);
    }

    Ok(ApplyResult {
        backups,
        summary: planned.summary,
        warnings: planned.warnings,
    })
}

pub fn server_preview_toggle(paths: &AppPaths, server_id_str: &str, enabled: bool) -> Result<WritePreview, AppError> {
    let planned = plan_toggle(paths, server_id_str, enabled).map_err(AppError::from)?;
    build_preview(planned).map_err(AppError::from)
}

pub fn server_apply_toggle(
    paths: &AppPaths,
    server_id_str: &str,
    enabled: bool,
    expected: Vec<FilePrecondition>,
) -> Result<ApplyResult, AppError> {
    let planned = plan_toggle(paths, server_id_str, enabled).map_err(AppError::from)?;
    apply_planned(paths, planned, &expected).map_err(AppError::from)
}

pub fn server_preview_add(
    paths: &AppPaths,
    client: Client,
    name: &str,
    transport: Transport,
    config: serde_json::Map<String, Value>,
) -> Result<WritePreview, AppError> {
    let planned = plan_add_server(paths, client, name, transport, config).map_err(AppError::from)?;
    build_preview(planned).map_err(AppError::from)
}

pub fn server_apply_add(
    paths: &AppPaths,
    client: Client,
    name: &str,
    transport: Transport,
    config: serde_json::Map<String, Value>,
    expected: Vec<FilePrecondition>,
) -> Result<ApplyResult, AppError> {
    let planned = plan_add_server(paths, client, name, transport, config).map_err(AppError::from)?;
    apply_planned(paths, planned, &expected).map_err(AppError::from)
}

pub fn server_preview_edit(
    paths: &AppPaths,
    server_id_str: &str,
    transport: Transport,
    payload: serde_json::Map<String, Value>,
) -> Result<WritePreview, AppError> {
    let planned = plan_edit_server(
        paths,
        server_id_str,
        ServerEditDraft { transport, payload },
    )
    .map_err(AppError::from)?;
    build_preview(planned).map_err(AppError::from)
}

pub fn server_apply_edit(
    paths: &AppPaths,
    server_id_str: &str,
    transport: Transport,
    payload: serde_json::Map<String, Value>,
    expected: Vec<FilePrecondition>,
) -> Result<ApplyResult, AppError> {
    let planned = plan_edit_server(
        paths,
        server_id_str,
        ServerEditDraft { transport, payload },
    )
    .map_err(AppError::from)?;
    apply_planned(paths, planned, &expected).map_err(AppError::from)
}

pub fn profile_list(paths: &AppPaths) -> Result<Vec<Profile>, AppError> {
    load_profiles(&paths.profiles_path).map_err(AppError::from)
}

pub fn profile_create(paths: &AppPaths, name: &str, targets: ProfileTargets) -> Result<Profile, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "name is required"));
    }
    let mut all = load_profiles(&paths.profiles_path).map_err(AppError::from)?;
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let p = Profile {
        profile_id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        targets,
        updated_at: now,
    };
    all.push(p.clone());
    let s = save_profiles(&all).map_err(AppError::from)?;
    write_atomic(&paths.profiles_path, &s).map_err(AppError::from)?;
    Ok(p)
}

pub fn profile_update(
    paths: &AppPaths,
    profile_id: &str,
    name: Option<String>,
    targets: Option<ProfileTargets>,
) -> Result<Profile, AppError> {
    let mut all = load_profiles(&paths.profiles_path).map_err(AppError::from)?;
    let mut found = None;
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    for p in all.iter_mut() {
        if p.profile_id == profile_id {
            if let Some(n) = name.clone() {
                p.name = n;
            }
            if let Some(t) = targets.clone() {
                p.targets = t;
            }
            p.updated_at = now.clone();
            found = Some(p.clone());
            break;
        }
    }
    let Some(found) = found else {
        return Err(AppError::new("NOT_FOUND", format!("profile not found: {profile_id}")));
    };
    let s = save_profiles(&all).map_err(AppError::from)?;
    write_atomic(&paths.profiles_path, &s).map_err(AppError::from)?;
    Ok(found)
}

pub fn profile_delete(paths: &AppPaths, profile_id: &str) -> Result<(), AppError> {
    let mut all = load_profiles(&paths.profiles_path).map_err(AppError::from)?;
    let before = all.len();
    all.retain(|p| p.profile_id != profile_id);
    if all.len() == before {
        return Err(AppError::new("NOT_FOUND", format!("profile not found: {profile_id}")));
    }
    let s = save_profiles(&all).map_err(AppError::from)?;
    write_atomic(&paths.profiles_path, &s).map_err(AppError::from)?;
    Ok(())
}

fn plan_apply_profile(paths: &AppPaths, profile: &Profile, client: Client) -> Result<PlannedWrite, CoreError> {
    let mut planned = PlannedWrite {
        files: vec![],
        moves: vec![],
        expected_files: vec![],
        summary: WriteSummary::default(),
        warnings: vec![],
        backup_op: BackupOp::ApplyProfile,
    };

    let want: BTreeSet<String> = match client {
        Client::ClaudeCode => profile
            .targets
            .claude_code
            .iter()
            .filter_map(|sid| parse_server_id(sid).ok().map(|(_c, n)| n))
            .collect(),
        Client::Codex => profile
            .targets
            .codex
            .iter()
            .filter_map(|sid| parse_server_id(sid).ok().map(|(_c, n)| n))
            .collect(),
    };

    let mut store = load_registry_store(paths)?;
    let mut existing = BTreeSet::new();
    for server in store.servers.iter_mut().filter(|server| server.client == client) {
        existing.insert(server.name.clone());
        let should_enable = want.contains(&server.name);
        if server.enabled != should_enable {
            server.enabled = should_enable;
            server.updated_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
            server.payload =
                registry_payload_for_storage(client, server.transport, server.payload.clone(), should_enable);
            if should_enable {
                planned.summary.will_enable.push(server.server_id.clone());
            } else {
                planned.summary.will_disable.push(server.server_id.clone());
            }
        }
    }

    for name in want {
        if !existing.contains(&name) {
            planned.warnings.push(Warning {
                code: "MISSING_SERVER".to_string(),
                message: format!("Missing server config for profile target: {}:{name}", match client {
                    Client::ClaudeCode => "claude_code",
                    Client::Codex => "codex",
                }),
                details: None,
            });
        }
    }

    sort_registry_servers(&mut store);
    let before_registry = read_to_string_opt(&paths.mcp_registry_path)?;
    let after_registry = serialize_registry_store(&store)?;
    planned.files.push(PlannedFileWrite {
        path: paths.mcp_registry_path.clone(),
        before: before_registry,
        after: after_registry,
    });

    let external_path = mcp_external_path(paths, client).to_path_buf();
    let before_external = read_to_string_opt(&external_path)?;
    let after_external = export_registry_client_config(paths, &store, client)?;
    if should_write_external(&before_external, &after_external, client) {
        planned.files.push(PlannedFileWrite {
            path: external_path,
            before: before_external,
            after: after_external,
        });
    }

    Ok(planned)
}

pub fn profile_preview_apply(paths: &AppPaths, profile_id: &str, client: Client) -> Result<WritePreview, AppError> {
    let all = load_profiles(&paths.profiles_path).map_err(AppError::from)?;
    let Some(p) = all.iter().find(|p| p.profile_id == profile_id) else {
        return Err(AppError::new("NOT_FOUND", format!("profile not found: {profile_id}")));
    };
    let planned = plan_apply_profile(paths, p, client).map_err(AppError::from)?;
    build_preview(planned).map_err(AppError::from)
}

pub fn profile_apply(
    paths: &AppPaths,
    profile_id: &str,
    client: Client,
    expected: Vec<FilePrecondition>,
) -> Result<ApplyResult, AppError> {
    let all = load_profiles(&paths.profiles_path).map_err(AppError::from)?;
    let Some(p) = all.iter().find(|p| p.profile_id == profile_id) else {
        return Err(AppError::new("NOT_FOUND", format!("profile not found: {profile_id}")));
    };
    let planned = plan_apply_profile(paths, p, client).map_err(AppError::from)?;
    apply_planned(paths, planned, &expected).map_err(AppError::from)
}

pub fn backup_list(paths: &AppPaths, target_path: Option<String>) -> Result<Vec<BackupRecord>, AppError> {
    let mut all = load_backup_index(&paths.backup_index_path).map_err(AppError::from)?;
    if let Some(tp) = target_path {
        all.retain(|r| r.target_path == tp);
    }
    Ok(all)
}

pub fn backup_preview_rollback(paths: &AppPaths, backup_id: &str) -> Result<WritePreview, AppError> {
    let all = load_backup_index(&paths.backup_index_path).map_err(AppError::from)?;
    let Some(rec) = all.iter().find(|r| r.backup_id == backup_id) else {
        return Err(AppError::new("NOT_FOUND", format!("backup not found: {backup_id}")));
    };
    let target = PathBuf::from(&rec.target_path);
    let backup = PathBuf::from(&rec.backup_path);
    let current = read_to_string_opt(&target).map_err(AppError::from)?;
    let backup_content = fs::read_to_string(&backup)
        .map_err(|e| AppError::new("IO_ERROR", format!("read backup {}: {e}", backup.display())))?;

    let planned = PlannedWrite {
        files: vec![PlannedFileWrite {
            path: target,
            before: current,
            after: backup_content,
        }],
        moves: vec![],
        expected_files: vec![],
        summary: WriteSummary::default(),
        warnings: vec![],
        backup_op: BackupOp::Rollback,
    };
    build_preview(planned).map_err(AppError::from)
}

pub fn backup_apply_rollback(
    paths: &AppPaths,
    backup_id: &str,
    expected: Vec<FilePrecondition>,
) -> Result<ApplyResult, AppError> {
    validate_preconditions(&expected).map_err(AppError::from)?;

    let all = load_backup_index(&paths.backup_index_path).map_err(AppError::from)?;
    let Some(rec) = all.iter().find(|r| r.backup_id == backup_id) else {
        return Err(AppError::new("NOT_FOUND", format!("backup not found: {backup_id}")));
    };
    let target = PathBuf::from(&rec.target_path);
    let backup = PathBuf::from(&rec.backup_path);
    let backup_content = fs::read_to_string(&backup)
        .map_err(|e| AppError::new("IO_ERROR", format!("read backup {}: {e}", backup.display())))?;

    // Backup current target before rollback.
    let mut backups = Vec::new();
    if target.exists() {
        let rec2 = backup_file(&paths.backups_dir, &target, BackupOp::Rollback, "pre-rollback backup")
            .map_err(AppError::from)?;
        backups.push(rec2);
    }

    write_atomic(&target, &backup_content).map_err(AppError::from)?;

    // persist new backup record
    if !backups.is_empty() {
        let mut index = load_backup_index(&paths.backup_index_path).unwrap_or_default();
        index.extend(backups.clone());
        let s = save_backup_index(&index).map_err(AppError::from)?;
        let _ = write_atomic(&paths.backup_index_path, &s);
    }

    Ok(ApplyResult {
        backups,
        summary: WriteSummary::default(),
        warnings: vec![],
    })
}

pub fn expected_files_from_preview(preview: &WritePreview) -> Vec<FilePrecondition> {
    preview
        .files
        .iter()
        .map(|f| FilePrecondition {
            path: f.path.clone(),
            expected_before_sha256: f.before_sha256.clone(),
        })
        .collect()
}
