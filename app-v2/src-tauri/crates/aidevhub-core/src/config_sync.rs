use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use similar::TextDiff;
use toml_edit::DocumentMut;

use crate::{
    model::{
        AppError, Client, ConfigAcceptMcpResponse, ConfigCheckUpdatesResponse, ConfigIgnoreCondition,
        ConfigIgnoreUpdatesResponse, ConfigSourceKind, ConfigUpdateItem,
    },
    mcp_registry,
    ops::AppPaths,
};

const CLAUDE_MCP_SOURCE_ID: &str = "claudecode.mcp.json";
const CODEX_MCP_SOURCE_ID: &str = "codex.mcp.json";
const CLAUDE_SKILL_SOURCE_ID: &str = "claudecode.skill.json";
const CODEX_SKILL_SOURCE_ID: &str = "codex.skill.json";
const SNAPSHOT_FILE_NAME: &str = "config_snapshots.json";
const LEGACY_SNAPSHOT_FILE_NAME: &str = "config_sync_snapshot.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ConfigSnapshotStore {
    #[serde(default)]
    sources: BTreeMap<String, ConfigSnapshotEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConfigSnapshotEntry {
    content: String,
    content_sha256: String,
}

#[derive(Debug, Clone)]
struct ConfigSourceState {
    source_id: &'static str,
    client: Client,
    kind: ConfigSourceKind,
    content: String,
    content_sha256: String,
    confirm_sync_available: Option<bool>,
}

pub fn config_check_updates(paths: &AppPaths) -> Result<ConfigCheckUpdatesResponse, AppError> {
    let current_states = collect_current_source_states(paths)?;
    let snapshot_path = snapshot_path(paths);
    let (mut store, was_corrupted, used_legacy_path) = load_snapshot_store_with_fallback(paths)?;
    let mut updates = Vec::new();
    let mut touched = was_corrupted || used_legacy_path;

    for state in current_states {
        let previous = store.sources.get(state.source_id).cloned();
        let previous = if let Some(previous) = previous {
            previous
        } else {
            if !was_corrupted && !state.content.trim().is_empty() {
                updates.push(ConfigUpdateItem {
                    source_id: state.source_id.to_string(),
                    client: state.client,
                    kind: state.kind,
                    current_sha256: state.content_sha256,
                    diff_unified: unified_diff(state.source_id, "", &state.content),
                    requires_confirm_sync: state.kind == ConfigSourceKind::Mcp,
                    confirm_sync_available: state.confirm_sync_available,
                });
                continue;
            }

            touched = true;
            store.sources.insert(
                state.source_id.to_string(),
                ConfigSnapshotEntry {
                    content: state.content.clone(),
                    content_sha256: state.content_sha256.clone(),
                },
            );
            continue;
        };

        if previous.content_sha256 == state.content_sha256 {
            continue;
        }

        updates.push(ConfigUpdateItem {
            source_id: state.source_id.to_string(),
            client: state.client,
            kind: state.kind,
            current_sha256: state.content_sha256,
            diff_unified: unified_diff(state.source_id, &previous.content, &state.content),
            requires_confirm_sync: state.kind == ConfigSourceKind::Mcp,
            confirm_sync_available: state.confirm_sync_available,
        });
    }

    if touched {
        save_snapshot_store(&snapshot_path, &store)?;
    }

    Ok(ConfigCheckUpdatesResponse { updates })
}

pub fn config_ignore_updates(
    paths: &AppPaths,
    conditions: Vec<ConfigIgnoreCondition>,
) -> Result<ConfigIgnoreUpdatesResponse, AppError> {
    let current_states = collect_current_source_states(paths)?;
    let current_state_map: BTreeMap<String, ConfigSourceState> = current_states
        .into_iter()
        .map(|state| (state.source_id.to_string(), state))
        .collect();
    let snapshot_path = snapshot_path(paths);
    let (mut store, _was_corrupted, _used_legacy_path) = load_snapshot_store_with_fallback(paths)?;
    let mut ignored_source_ids = Vec::new();
    let mut touched = false;
    let mut stale_sources = Vec::new();

    for condition in conditions {
        let source_id = condition.source_id;
        let Some(state) = current_state_map.get(&source_id) else {
            continue;
        };

        if state.content_sha256 != condition.current_sha256 {
            stale_sources.push(source_id);
            continue;
        }

        touched = true;
        ignored_source_ids.push(source_id.clone());
        store.sources.insert(
            source_id,
            ConfigSnapshotEntry {
                content: state.content.clone(),
                content_sha256: state.content_sha256.clone(),
            },
        );
    }

    if !stale_sources.is_empty() {
        return Err(
            AppError::new(
                "PRECONDITION_FAILED",
                "Some config sources changed before ignore was applied. Please refresh updates.",
            )
            .with_details(serde_json::json!({ "stale_source_ids": stale_sources })),
        );
    }

    if touched {
        save_snapshot_store(&snapshot_path, &store)?;
    }

    Ok(ConfigIgnoreUpdatesResponse { ignored_source_ids })
}

pub fn config_accept_mcp_updates(
    paths: &AppPaths,
    source_id: String,
    current_sha256: String,
    client: Client,
) -> Result<ConfigAcceptMcpResponse, AppError> {
    let current_states = collect_current_source_states(paths)?;
    let current_state = current_states
        .into_iter()
        .find(|state| state.source_id == source_id)
        .ok_or_else(|| AppError::new("VALIDATION_ERROR", format!("unknown source_id: {source_id}")))?;

    if current_state.kind != ConfigSourceKind::Mcp {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!("source is not MCP-compatible: {source_id}"),
        ));
    }
    if current_state.client != client {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!("source_id/client mismatch: {source_id}"),
        ));
    }
    if current_state.content_sha256 != current_sha256 {
        return Err(
            AppError::new(
                "PRECONDITION_FAILED",
                "Config source changed before accept was applied. Please refresh updates.",
            )
            .with_details(serde_json::json!({ "stale_source_ids": [source_id.clone()] })),
        );
    }

    let registry_before = read_to_string_opt(&paths.mcp_registry_path)?;
    mcp_registry::import_external_source(paths, &source_id, client, &current_state.content)?;

    let snapshot_result: Result<(), AppError> = (|| {
        let snapshot_path = snapshot_path(paths);
        let (mut store, _was_corrupted, _used_legacy_path) = load_snapshot_store_with_fallback(paths)?;
        store.sources.insert(
            source_id.clone(),
            ConfigSnapshotEntry {
                content: current_state.content,
                content_sha256: current_sha256,
            },
        );
        save_snapshot_store(&snapshot_path, &store)
    })();

    if let Err(snapshot_err) = snapshot_result {
        if let Err(rollback_err) = restore_registry_to_previous(paths, registry_before) {
            return Err(
                AppError::new(
                    "INTERNAL_ERROR",
                    "Failed to update snapshot and rollback MCP registry",
                )
                .with_details(serde_json::json!({
                    "snapshot_error": { "code": snapshot_err.code, "message": snapshot_err.message },
                    "rollback_error": { "code": rollback_err.code, "message": rollback_err.message }
                })),
            );
        }
        return Err(snapshot_err);
    }

    Ok(ConfigAcceptMcpResponse {
        accepted: true,
        message: format!("MCP source accepted: {source_id}"),
    })
}

fn snapshot_path(paths: &AppPaths) -> PathBuf {
    paths.app_local_data_dir.join(SNAPSHOT_FILE_NAME)
}

fn legacy_snapshot_path(paths: &AppPaths) -> PathBuf {
    paths.app_local_data_dir.join(LEGACY_SNAPSHOT_FILE_NAME)
}

fn collect_current_source_states(paths: &AppPaths) -> Result<Vec<ConfigSourceState>, AppError> {
    let claude_mcp = read_to_string_opt(&paths.claude_config_path)?.unwrap_or_default();
    let codex_mcp = read_to_string_opt(&paths.codex_config_path)?.unwrap_or_default();
    let claude_skill = build_skill_snapshot_text(&paths.claude_commands_dir, &paths.claude_commands_disabled_dir)?;
    let codex_skill = build_skill_snapshot_text(&paths.codex_skills_dir, &paths.codex_skills_disabled_dir)?;

    Ok(vec![
        ConfigSourceState {
            source_id: CLAUDE_MCP_SOURCE_ID,
            client: Client::ClaudeCode,
            kind: ConfigSourceKind::Mcp,
            content_sha256: sha256_hex(&claude_mcp),
            content: claude_mcp.clone(),
            confirm_sync_available: Some(is_claude_mcp_text_confirmable(&claude_mcp)),
        },
        ConfigSourceState {
            source_id: CODEX_MCP_SOURCE_ID,
            client: Client::Codex,
            kind: ConfigSourceKind::Mcp,
            content_sha256: sha256_hex(&codex_mcp),
            content: codex_mcp.clone(),
            confirm_sync_available: Some(is_codex_mcp_text_confirmable(&codex_mcp)),
        },
        ConfigSourceState {
            source_id: CLAUDE_SKILL_SOURCE_ID,
            client: Client::ClaudeCode,
            kind: ConfigSourceKind::Skill,
            content_sha256: sha256_hex(&claude_skill),
            content: claude_skill,
            confirm_sync_available: None,
        },
        ConfigSourceState {
            source_id: CODEX_SKILL_SOURCE_ID,
            client: Client::Codex,
            kind: ConfigSourceKind::Skill,
            content_sha256: sha256_hex(&codex_skill),
            content: codex_skill,
            confirm_sync_available: None,
        },
    ])
}

fn is_claude_mcp_text_confirmable(text: &str) -> bool {
    if text.trim().is_empty() {
        return true;
    }
    serde_json::from_str::<serde_json::Value>(text).is_ok()
}

fn is_codex_mcp_text_confirmable(text: &str) -> bool {
    if text.trim().is_empty() {
        return true;
    }
    text.parse::<DocumentMut>().is_ok()
}

fn load_snapshot_store(path: &Path) -> Result<(ConfigSnapshotStore, bool), AppError> {
    let s = read_to_string_opt(path)?;
    let Some(s) = s else {
        return Ok((ConfigSnapshotStore::default(), false));
    };

    match serde_json::from_str(&s) {
        Ok(store) => Ok((store, false)),
        Err(_) => Ok((ConfigSnapshotStore::default(), true)),
    }
}

fn load_snapshot_store_with_fallback(paths: &AppPaths) -> Result<(ConfigSnapshotStore, bool, bool), AppError> {
    let primary = snapshot_path(paths);
    if primary.exists() {
        let (store, was_corrupted) = load_snapshot_store(&primary)?;
        return Ok((store, was_corrupted, false));
    }

    let legacy = legacy_snapshot_path(paths);
    if legacy.exists() {
        let (store, was_corrupted) = load_snapshot_store(&legacy)?;
        return Ok((store, was_corrupted, true));
    }

    Ok((ConfigSnapshotStore::default(), false, false))
}

fn save_snapshot_store(path: &Path, store: &ConfigSnapshotStore) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::new("IO_ERROR", format!("mkdir {}: {e}", parent.display())))?;
    }

    let text = serde_json::to_string_pretty(store)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize config snapshot: {e}")))?;
    write_atomic(path, &text)
}

fn restore_registry_to_previous(paths: &AppPaths, previous: Option<String>) -> Result<(), AppError> {
    match previous {
        Some(content) => write_atomic(&paths.mcp_registry_path, &content),
        None => match fs::remove_file(&paths.mcp_registry_path) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(AppError::new(
                "IO_ERROR",
                format!("remove {}: {e}", paths.mcp_registry_path.display()),
            )),
        },
    }
}

fn write_atomic(path: &Path, content: &str) -> Result<(), AppError> {
    let parent = path.parent().ok_or_else(|| {
        AppError::new(
            "INTERNAL_ERROR",
            format!("snapshot path has no parent: {}", path.display()),
        )
    })?;

    let mut tmp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| AppError::new("IO_ERROR", format!("create temp file in {}: {e}", parent.display())))?;
    tmp.write_all(content.as_bytes())
        .map_err(|e| AppError::new("IO_ERROR", format!("write temp file in {}: {e}", parent.display())))?;
    tmp.flush()
        .map_err(|e| AppError::new("IO_ERROR", format!("flush temp file in {}: {e}", parent.display())))?;

    let (_file, tmp_path) = tmp
        .keep()
        .map_err(|e| AppError::new("IO_ERROR", format!("keep temp file in {}: {e}", parent.display())))?;
    drop(_file);

    #[cfg(windows)]
    {
        if path.exists() {
            fs::remove_file(path)
                .map_err(|e| AppError::new("IO_ERROR", format!("remove {}: {e}", path.display())))?;
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

fn read_to_string_opt(path: &Path) -> Result<Option<String>, AppError> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::new("IO_ERROR", format!("read {}: {e}", path.display()))),
    }
}

fn sha256_hex(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hex::encode(hasher.finalize())
}

fn unified_diff(header: &str, before: &str, after: &str) -> String {
    TextDiff::from_lines(before, after)
        .unified_diff()
        .context_radius(3)
        .header(header, header)
        .to_string()
}

fn build_skill_snapshot_text(enabled_dir: &Path, disabled_dir: &Path) -> Result<String, AppError> {
    let enabled = collect_skill_files(enabled_dir)?;
    let disabled = collect_skill_files(disabled_dir)?;

    let mut lines = Vec::new();
    for (path, content) in enabled {
        lines.push(format!("[enabled] {path}"));
        lines.push(content);
    }
    for (path, content) in disabled {
        lines.push(format!("[disabled] {path}"));
        lines.push(content);
    }
    Ok(lines.join("\n"))
}

fn collect_skill_files(base_dir: &Path) -> Result<Vec<(String, String)>, AppError> {
    if !base_dir.exists() {
        return Ok(Vec::new());
    }

    let mut stack = vec![base_dir.to_path_buf()];
    let mut files = BTreeSet::new();
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir)
            .map_err(|e| AppError::new("IO_ERROR", format!("read_dir {}: {e}", dir.display())))?;
        for entry in entries {
            let entry =
                entry.map_err(|e| AppError::new("IO_ERROR", format!("read_dir entry {}: {e}", dir.display())))?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.is_file() {
                files.insert(path);
            }
        }
    }

    let mut out = Vec::new();
    for file in files {
        let rel = file
            .strip_prefix(base_dir)
            .map_err(|e| {
                AppError::new(
                    "INTERNAL_ERROR",
                    format!("strip_prefix {} from {}: {e}", base_dir.display(), file.display()),
                )
            })?
            .to_string_lossy()
            .replace('\\', "/");
        let content = fs::read_to_string(&file)
            .map_err(|e| AppError::new("IO_ERROR", format!("read {}: {e}", file.display())))?;
        out.push((rel, content));
    }

    Ok(out)
}
