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

fn load_disabled_pool(path: &Path) -> Result<BTreeMap<String, Value>, CoreError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else {
        return Ok(BTreeMap::new());
    };
    let v: Value =
        serde_json::from_str(&s).map_err(|e| CoreError::Parse(format!("parse {}: {e}", path.display())))?;
    let Value::Object(map) = v else {
        return Err(CoreError::Parse(format!(
            "{} is not a JSON object",
            path.display()
        )));
    };
    Ok(map.into_iter().map(|(k, v)| (k, v)).collect())
}

fn save_disabled_pool(map: &BTreeMap<String, Value>) -> Result<String, CoreError> {
    serde_json::to_string_pretty(map).map_err(|e| CoreError::Internal(format!("serialize disabled_pool: {e}")))
}

fn load_profiles(path: &Path) -> Result<Vec<Profile>, CoreError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else { return Ok(vec![]); };
    serde_json::from_str(&s).map_err(|e| CoreError::Parse(format!("parse {}: {e}", path.display())))
}

fn save_profiles(v: &[Profile]) -> Result<String, CoreError> {
    serde_json::to_string_pretty(v).map_err(|e| CoreError::Internal(format!("serialize profiles: {e}")))
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
        map.insert("mcpServers".to_string(), Value::Object(servers));
    } else {
        return Err(CoreError::Parse("claude config root is not JSON object".to_string()));
    }
    serde_json::to_string_pretty(&root).map_err(|e| CoreError::Internal(format!("serialize claude config: {e}")))
}

fn parse_codex_doc(path: &Path) -> Result<DocumentMut, CoreError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else {
        return Ok(DocumentMut::new());
    };
    s.parse::<DocumentMut>()
        .map_err(|e| CoreError::Parse(format!("parse {}: {e}", path.display())))
}

fn codex_mcp_servers_table_mut(doc: &mut DocumentMut) -> &mut Table {
    if !doc.as_table().contains_key("mcp_servers") {
        doc["mcp_servers"] = Item::Table(Table::new());
    }
    doc["mcp_servers"].as_table_mut().unwrap()
}

fn codex_get_enabled(table: &Table) -> bool {
    table
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

fn codex_set_enabled(table: &mut Table, enabled: bool) {
    table["enabled"] = toml_edit::value(enabled);
}

fn codex_get_transport(table: &Table) -> Transport {
    if table.get("url").and_then(|v| v.as_str()).is_some() {
        Transport::Http
    } else if table.get("command").and_then(|v| v.as_str()).is_some() {
        Transport::Stdio
    } else {
        Transport::Unknown
    }
}

fn codex_identity(table: &Table) -> String {
    if let Some(cmd) = table.get("command").and_then(|v| v.as_str()) {
        let mut parts = vec![cmd.to_string()];
        if let Some(arr) = table.get("args").and_then(|v| v.as_array()) {
            for it in arr.iter() {
                if let Some(s) = it.as_str() {
                    parts.push(s.to_string());
                }
            }
        }
        return parts.join(" ");
    }
    if let Some(url) = table.get("url").and_then(|v| v.as_str()) {
        return url.to_string();
    }
    "unknown".to_string()
}

fn toml_table_to_json_map(table: &Table) -> serde_json::Map<String, Value> {
    let mut map = serde_json::Map::new();
    for (k, item) in table.iter() {
        if let Some(v) = item.as_value() {
            let json = match v {
                TomlValue::String(s) => Value::String(s.value().to_string()),
                TomlValue::Integer(i) => Value::Number((*i.value()).into()),
                TomlValue::Float(f) => Value::Number(serde_json::Number::from_f64(*f.value()).unwrap_or_else(|| 0.into())),
                TomlValue::Boolean(b) => Value::Bool(*b.value()),
                TomlValue::Datetime(dt) => Value::String(dt.value().to_string()),
                TomlValue::Array(arr) => {
                    let mut out = Vec::new();
                    for it in arr.iter() {
                        if let Some(s) = it.as_str() {
                            out.push(Value::String(s.to_string()));
                        } else if let Some(b) = it.as_bool() {
                            out.push(Value::Bool(b));
                        } else if let Some(i) = it.as_integer() {
                            out.push(Value::Number(i.into()));
                        } else if let Some(f) = it.as_float() {
                            out.push(Value::Number(
                                serde_json::Number::from_f64(f).unwrap_or_else(|| 0.into()),
                            ));
                        } else if let Some(dt) = it.as_datetime() {
                            out.push(Value::String(dt.to_string()));
                        } else {
                            out.push(Value::Null);
                        }
                    }
                    Value::Array(out)
                }
                _ => Value::Null,
            };
            map.insert(k.to_string(), json);
        }
    }
    map
}

fn claude_transport(cfg: &Value) -> Transport {
    if cfg.get("type").and_then(|v| v.as_str()) == Some("http") || cfg.get("url").is_some() {
        Transport::Http
    } else if cfg.get("command").is_some() {
        Transport::Stdio
    } else {
        Transport::Unknown
    }
}

fn claude_identity(cfg: &Value) -> String {
    if let Some(cmd) = cfg.get("command").and_then(|v| v.as_str()) {
        let mut parts = vec![cmd.to_string()];
        if let Some(args) = cfg.get("args").and_then(|v| v.as_array()) {
            for it in args {
                if let Some(s) = it.as_str() {
                    parts.push(s.to_string());
                }
            }
        }
        return parts.join(" ");
    }
    if let Some(url) = cfg.get("url").and_then(|v| v.as_str()) {
        return url.to_string();
    }
    "unknown".to_string()
}

fn to_server_record_claude(
    name: &str,
    enabled: bool,
    source_file: &Path,
    cfg: Value,
    reveal: bool,
) -> ServerRecord {
    let transport = claude_transport(&cfg);
    let identity = claude_identity(&cfg);
    let payload_obj = cfg.as_object().cloned().unwrap_or_default();
    let payload = mask_payload(payload_obj, reveal);
    ServerRecord {
        server_id: server_id(Client::ClaudeCode, name),
        name: name.to_string(),
        client: Client::ClaudeCode,
        transport,
        enabled,
        source_file: source_file.to_string_lossy().to_string(),
        identity,
        payload,
    }
}

fn to_server_record_codex(
    name: &str,
    enabled: bool,
    source_file: &Path,
    table: &Table,
    reveal: bool,
) -> ServerRecord {
    let transport = codex_get_transport(table);
    let identity = codex_identity(table);
    let payload_obj = toml_table_to_json_map(table);
    let payload = mask_payload(payload_obj, reveal);
    ServerRecord {
        server_id: server_id(Client::Codex, name),
        name: name.to_string(),
        client: Client::Codex,
        transport,
        enabled,
        source_file: source_file.to_string_lossy().to_string(),
        identity,
        payload,
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
    let mut out = Vec::new();

    if client.is_none() || client == Some(Client::ClaudeCode) {
        let (_root, servers) = parse_claude_config(&paths.claude_config_path).map_err(AppError::from)?;
        let pool = load_disabled_pool(&paths.disabled_pool_path).map_err(AppError::from)?;

        let mut names: BTreeSet<String> = BTreeSet::new();
        for k in servers.keys() {
            names.insert(k.clone());
        }
        for k in pool.keys() {
            names.insert(k.clone());
        }

        for name in names {
            if let Some(cfg) = servers.get(&name) {
                out.push(to_server_record_claude(
                    &name,
                    true,
                    &paths.claude_config_path,
                    cfg.clone(),
                    false,
                ));
            } else if let Some(cfg) = pool.get(&name) {
                out.push(to_server_record_claude(
                    &name,
                    false,
                    &paths.claude_config_path,
                    cfg.clone(),
                    false,
                ));
            }
        }
    }

    if client.is_none() || client == Some(Client::Codex) {
        let doc = parse_codex_doc(&paths.codex_config_path).map_err(AppError::from)?;
        if let Some(tbl) = doc.get("mcp_servers").and_then(|i| i.as_table()) {
            for (name, item) in tbl.iter() {
                if let Some(st) = item.as_table() {
                    let enabled = codex_get_enabled(st);
                    out.push(to_server_record_codex(
                        name,
                        enabled,
                        &paths.codex_config_path,
                        st,
                        false,
                    ));
                }
            }
        }
    }

    Ok(out)
}

pub fn server_get(paths: &AppPaths, server_id_str: &str, reveal: bool) -> Result<ServerRecord, AppError> {
    let (client, name) = parse_server_id(server_id_str).map_err(AppError::from)?;
    match client {
        Client::ClaudeCode => {
            let (_root, servers) = parse_claude_config(&paths.claude_config_path).map_err(AppError::from)?;
            let pool = load_disabled_pool(&paths.disabled_pool_path).map_err(AppError::from)?;
            if let Some(cfg) = servers.get(&name) {
                Ok(to_server_record_claude(&name, true, &paths.claude_config_path, cfg.clone(), reveal))
            } else if let Some(cfg) = pool.get(&name) {
                Ok(to_server_record_claude(
                    &name,
                    false,
                    &paths.claude_config_path,
                    cfg.clone(),
                    reveal,
                ))
            } else {
                Err(AppError::new("NOT_FOUND", format!("server not found: {server_id_str}")))
            }
        }
        Client::Codex => {
            let doc = parse_codex_doc(&paths.codex_config_path).map_err(AppError::from)?;
            let Some(tbl) = doc.get("mcp_servers").and_then(|i| i.as_table()) else {
                return Err(AppError::new("NOT_FOUND", format!("server not found: {server_id_str}")));
            };
            let Some(item) = tbl.get(&name) else {
                return Err(AppError::new("NOT_FOUND", format!("server not found: {server_id_str}")));
            };
            let Some(st) = item.as_table() else {
                return Err(AppError::new("PARSE_ERROR", format!("invalid codex server table: {server_id_str}")));
            };
            let enabled = codex_get_enabled(st);
            Ok(to_server_record_codex(&name, enabled, &paths.codex_config_path, st, reveal))
        }
    }
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

    match client {
        Client::ClaudeCode => {
            let (root, mut servers) = parse_claude_config(&paths.claude_config_path)?;
            let mut pool = load_disabled_pool(&paths.disabled_pool_path)?;

            let currently_enabled = servers.contains_key(&name);
            if enabled == currently_enabled {
                return Ok(planned);
            }

            if enabled {
                // move pool -> servers
                let Some(cfg) = pool.remove(&name) else {
                    planned.warnings.push(Warning {
                        code: "MISSING_SERVER".to_string(),
                        message: format!("Missing server config in disabled pool: {server_id_str}"),
                        details: None,
                    });
                    return Ok(planned);
                };
                servers.insert(name.clone(), cfg);
                planned.summary.will_enable.push(server_id_str.to_string());
            } else {
                // move servers -> pool
                let Some(cfg) = servers.remove(&name) else {
                    return Ok(planned);
                };
                pool.insert(name.clone(), cfg);
                planned.summary.will_disable.push(server_id_str.to_string());
            }

            let before_cfg = read_to_string_opt(&paths.claude_config_path)?;
            let after_cfg = write_claude_config(root, servers)?;
            planned.files.push(PlannedFileWrite {
                path: paths.claude_config_path.clone(),
                before: before_cfg,
                after: after_cfg,
            });

            let before_pool = read_to_string_opt(&paths.disabled_pool_path)?;
            let after_pool = save_disabled_pool(&pool)?;
            planned.files.push(PlannedFileWrite {
                path: paths.disabled_pool_path.clone(),
                before: before_pool,
                after: after_pool,
            });
        }
        Client::Codex => {
            let mut doc = parse_codex_doc(&paths.codex_config_path)?;
            let before = read_to_string_opt(&paths.codex_config_path)?;

            let servers = codex_mcp_servers_table_mut(&mut doc);
            let Some(item) = servers.get_mut(&name) else {
                return Err(CoreError::NotFound(format!("server not found: {server_id_str}")));
            };
            let Some(table) = item.as_table_mut() else {
                return Err(CoreError::Parse(format!("invalid codex server table: {server_id_str}")));
            };

            let curr = codex_get_enabled(table);
            if curr == enabled {
                return Ok(planned);
            }

            codex_set_enabled(table, enabled);
            if enabled {
                planned.summary.will_enable.push(server_id_str.to_string());
            } else {
                planned.summary.will_disable.push(server_id_str.to_string());
            }

            let after = doc.to_string();
            planned.files.push(PlannedFileWrite {
                path: paths.codex_config_path.clone(),
                before,
                after,
            });
        }
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

    match client {
        Client::ClaudeCode => {
            let (root, mut servers) = parse_claude_config(&paths.claude_config_path)?;
            let pool = load_disabled_pool(&paths.disabled_pool_path)?;
            if servers.contains_key(name) || pool.contains_key(name) {
                return Err(CoreError::Validation(format!("server already exists: {name}")));
            }
            let mut cfg = Value::Object(config);
            if transport == Transport::Http {
                if let Value::Object(m) = &mut cfg {
                    m.entry("type".to_string())
                        .or_insert(Value::String("http".to_string()));
                }
            }
            servers.insert(name.to_string(), cfg);
            planned.summary.will_add.push(server_id(client, name));
            planned.summary.will_enable.push(server_id(client, name));

            let before_cfg = read_to_string_opt(&paths.claude_config_path)?;
            let after_cfg = write_claude_config(root, servers)?;
            planned.files.push(PlannedFileWrite {
                path: paths.claude_config_path.clone(),
                before: before_cfg,
                after: after_cfg,
            });

            // no pool change needed
        }
        Client::Codex => {
            let mut doc = parse_codex_doc(&paths.codex_config_path)?;
            let before = read_to_string_opt(&paths.codex_config_path)?;
            let servers = codex_mcp_servers_table_mut(&mut doc);
            if servers.contains_key(name) {
                return Err(CoreError::Validation(format!("server already exists: {name}")));
            }
            let mut table = Table::new();
            // Minimal field check; other fields are passthrough.
            for (k, v) in config {
                match v {
                    Value::String(s) => {
                        table[&k] = toml_edit::value(s);
                    }
                    Value::Bool(b) => {
                        table[&k] = toml_edit::value(b);
                    }
                    Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            table[&k] = toml_edit::value(i);
                        } else if let Some(f) = n.as_f64() {
                            table[&k] = toml_edit::value(f);
                        }
                    }
                    Value::Array(arr) => {
                        let mut a = toml_edit::Array::new();
                        for it in arr {
                            if let Some(s) = it.as_str() {
                                a.push(s);
                            }
                        }
                        table[&k] = Item::Value(TomlValue::Array(a));
                    }
                    Value::Object(_) | Value::Null => {}
                }
            }
            codex_set_enabled(&mut table, true);
            servers[name] = Item::Table(table);

            let sid = server_id(client, name);
            planned.summary.will_add.push(sid.clone());
            planned.summary.will_enable.push(sid);

            planned.files.push(PlannedFileWrite {
                path: paths.codex_config_path.clone(),
                before,
                after: doc.to_string(),
            });
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

    match client {
        Client::ClaudeCode => {
            let (root, mut servers) = parse_claude_config(&paths.claude_config_path)?;
            let mut pool = load_disabled_pool(&paths.disabled_pool_path)?;

            let want: BTreeSet<String> = profile
                .targets
                .claude_code
                .iter()
                .filter_map(|sid| parse_server_id(sid).ok().map(|(_c, n)| n))
                .collect();

            // enable wanted servers from pool if not currently enabled
            for name in want.iter() {
                if servers.contains_key(name) {
                    continue;
                }
                if let Some(cfg) = pool.remove(name) {
                    servers.insert(name.clone(), cfg);
                    planned.summary.will_enable.push(server_id(Client::ClaudeCode, name));
                } else {
                    planned.warnings.push(Warning {
                        code: "MISSING_SERVER".to_string(),
                        message: format!("Missing server config for profile target: claude_code:{name}"),
                        details: None,
                    });
                }
            }

            // disable everything not in want
            let current_names: Vec<String> = servers.keys().cloned().collect();
            for name in current_names {
                if want.contains(&name) {
                    continue;
                }
                if let Some(cfg) = servers.remove(&name) {
                    pool.insert(name.clone(), cfg);
                    planned.summary.will_disable.push(server_id(Client::ClaudeCode, &name));
                }
            }

            let before_cfg = read_to_string_opt(&paths.claude_config_path)?;
            let after_cfg = write_claude_config(root, servers)?;
            planned.files.push(PlannedFileWrite {
                path: paths.claude_config_path.clone(),
                before: before_cfg,
                after: after_cfg,
            });

            let before_pool = read_to_string_opt(&paths.disabled_pool_path)?;
            let after_pool = save_disabled_pool(&pool)?;
            planned.files.push(PlannedFileWrite {
                path: paths.disabled_pool_path.clone(),
                before: before_pool,
                after: after_pool,
            });
        }
        Client::Codex => {
            let mut doc = parse_codex_doc(&paths.codex_config_path)?;
            let before = read_to_string_opt(&paths.codex_config_path)?;
            let servers = codex_mcp_servers_table_mut(&mut doc);

            let want: BTreeSet<String> = profile
                .targets
                .codex
                .iter()
                .filter_map(|sid| parse_server_id(sid).ok().map(|(_c, n)| n))
                .collect();

            // Toggle enabled for all existing servers; do not delete anything.
            let mut existing: BTreeSet<String> = BTreeSet::new();
            for (name, item) in servers.iter_mut() {
                if let Some(tbl) = item.as_table_mut() {
                    let name_str = name.get();
                    existing.insert(name_str.to_string());
                    let should = want.contains(name_str);
                    let curr = codex_get_enabled(tbl);
                    if curr != should {
                        codex_set_enabled(tbl, should);
                        if should {
                            planned
                                .summary
                                .will_enable
                                .push(server_id(Client::Codex, name_str));
                        } else {
                            planned
                                .summary
                                .will_disable
                                .push(server_id(Client::Codex, name_str));
                        }
                    }
                }
            }

            // Missing servers in profile are warned and skipped.
            for name in want {
                if !existing.contains(&name) {
                    planned.warnings.push(Warning {
                        code: "MISSING_SERVER".to_string(),
                        message: format!("Missing server config for profile target: codex:{name}"),
                        details: None,
                    });
                }
            }

            planned.files.push(PlannedFileWrite {
                path: paths.codex_config_path.clone(),
                before,
                after: doc.to_string(),
            });
        }
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
