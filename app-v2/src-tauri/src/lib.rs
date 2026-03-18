use std::path::PathBuf;

use aidevhub_core::model::{AppError, Client, FilePrecondition, ProfileTargets, RuntimeGetInfoResponse, Transport};
use aidevhub_core::ops::{self, AppPaths};
use serde::Serialize;
use tauri::Manager;

fn resolve_paths(app: &tauri::AppHandle) -> Result<AppPaths, AppError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| AppError::new("IO_ERROR", format!("home_dir: {e}")))?;

    let claude_config_path = home.join(".claude.json");
    let claude_commands_dir = home.join(".claude").join("commands");
    let claude_commands_disabled_dir = home.join(".claude").join("commands_disabled");

    let codex_home = if let Some(codex_home) = std::env::var_os("CODEX_HOME") {
        PathBuf::from(codex_home)
    } else {
        home.join(".codex")
    };
    let codex_config_path = codex_home.join("config.toml");
    let codex_skills_dir = codex_home.join("skills");
    let codex_skills_disabled_dir = codex_home.join("skills_disabled");

    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::new("IO_ERROR", format!("app_local_data_dir: {e}")))?;

    Ok(AppPaths {
        claude_config_path,
        claude_commands_dir,
        claude_commands_disabled_dir,
        codex_config_path,
        codex_skills_dir,
        codex_skills_disabled_dir,
        app_local_data_dir: app_local_data_dir.clone(),
        profiles_path: app_local_data_dir.join("profiles.json"),
        disabled_pool_path: app_local_data_dir.join("disabled_pool.json"),
        backups_dir: app_local_data_dir.join("backups"),
        backup_index_path: app_local_data_dir.join("backup_index.json"),
    })
}

#[derive(Debug, Clone, Serialize)]
struct OkResponse {
    ok: bool,
}

#[tauri::command]
fn runtime_get_info(app: tauri::AppHandle) -> Result<RuntimeGetInfoResponse, AppError> {
    let paths = resolve_paths(&app)?;
    ops::runtime_get_info(&paths)
}

#[tauri::command]
fn server_list(app: tauri::AppHandle, client: Option<Client>) -> Result<Vec<aidevhub_core::model::ServerRecord>, AppError> {
    let paths = resolve_paths(&app)?;
    ops::server_list(&paths, client)
}

#[tauri::command]
fn server_get(
    app: tauri::AppHandle,
    server_id: String,
    reveal_secrets: Option<bool>,
) -> Result<aidevhub_core::model::ServerRecord, AppError> {
    let paths = resolve_paths(&app)?;
    ops::server_get(&paths, &server_id, reveal_secrets.unwrap_or(false))
}

#[tauri::command]
fn server_preview_toggle(
    app: tauri::AppHandle,
    server_id: String,
    enabled: bool,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    ops::server_preview_toggle(&paths, &server_id, enabled)
}

#[tauri::command]
fn server_apply_toggle(
    app: tauri::AppHandle,
    server_id: String,
    enabled: bool,
    expected_files: Vec<FilePrecondition>,
) -> Result<aidevhub_core::model::ApplyResult, AppError> {
    let paths = resolve_paths(&app)?;
    ops::server_apply_toggle(&paths, &server_id, enabled, expected_files)
}

#[tauri::command]
fn server_preview_add(
    app: tauri::AppHandle,
    client: Client,
    name: String,
    transport: Transport,
    config: serde_json::Value,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    let cfg = config
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::new("VALIDATION_ERROR", "config must be an object"))?;
    ops::server_preview_add(&paths, client, &name, transport, cfg)
}

#[tauri::command]
fn server_apply_add(
    app: tauri::AppHandle,
    client: Client,
    name: String,
    transport: Transport,
    config: serde_json::Value,
    expected_files: Vec<FilePrecondition>,
) -> Result<aidevhub_core::model::ApplyResult, AppError> {
    let paths = resolve_paths(&app)?;
    let cfg = config
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::new("VALIDATION_ERROR", "config must be an object"))?;
    ops::server_apply_add(&paths, client, &name, transport, cfg, expected_files)
}

#[tauri::command]
fn profile_list(app: tauri::AppHandle) -> Result<Vec<aidevhub_core::model::Profile>, AppError> {
    let paths = resolve_paths(&app)?;
    ops::profile_list(&paths)
}

#[tauri::command]
fn profile_create(
    app: tauri::AppHandle,
    name: String,
    targets: ProfileTargets,
) -> Result<aidevhub_core::model::Profile, AppError> {
    let paths = resolve_paths(&app)?;
    ops::profile_create(&paths, &name, targets)
}

#[tauri::command]
fn profile_update(
    app: tauri::AppHandle,
    profile_id: String,
    name: Option<String>,
    targets: Option<ProfileTargets>,
) -> Result<aidevhub_core::model::Profile, AppError> {
    let paths = resolve_paths(&app)?;
    ops::profile_update(&paths, &profile_id, name, targets)
}

#[tauri::command]
fn profile_delete(app: tauri::AppHandle, profile_id: String) -> Result<OkResponse, AppError> {
    let paths = resolve_paths(&app)?;
    ops::profile_delete(&paths, &profile_id)?;
    Ok(OkResponse { ok: true })
}

#[tauri::command]
fn profile_preview_apply(
    app: tauri::AppHandle,
    profile_id: String,
    client: Client,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    ops::profile_preview_apply(&paths, &profile_id, client)
}

#[tauri::command]
fn profile_apply(
    app: tauri::AppHandle,
    profile_id: String,
    client: Client,
    expected_files: Vec<FilePrecondition>,
) -> Result<aidevhub_core::model::ApplyResult, AppError> {
    let paths = resolve_paths(&app)?;
    ops::profile_apply(&paths, &profile_id, client, expected_files)
}

#[tauri::command]
fn backup_list(
    app: tauri::AppHandle,
    target_path: Option<String>,
) -> Result<Vec<aidevhub_core::model::BackupRecord>, AppError> {
    let paths = resolve_paths(&app)?;
    ops::backup_list(&paths, target_path)
}

#[tauri::command]
fn backup_preview_rollback(
    app: tauri::AppHandle,
    backup_id: String,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    ops::backup_preview_rollback(&paths, &backup_id)
}

#[tauri::command]
fn backup_apply_rollback(
    app: tauri::AppHandle,
    backup_id: String,
    expected_files: Vec<FilePrecondition>,
) -> Result<aidevhub_core::model::ApplyResult, AppError> {
    let paths = resolve_paths(&app)?;
    ops::backup_apply_rollback(&paths, &backup_id, expected_files)
}

#[tauri::command]
fn skill_list(
    app: tauri::AppHandle,
    client: Option<Client>,
    scope: Option<String>,
) -> Result<Vec<aidevhub_core::model::SkillRecord>, AppError> {
    let paths = resolve_paths(&app)?;
    ops::skill_list(&paths, client, scope)
}

#[tauri::command]
fn skill_get(
    app: tauri::AppHandle,
    skill_id: String,
) -> Result<aidevhub_core::model::SkillGetResponse, AppError> {
    let paths = resolve_paths(&app)?;
    ops::skill_get(&paths, &skill_id)
}

#[tauri::command]
fn skill_preview_create(
    app: tauri::AppHandle,
    client: Client,
    name: String,
    description: String,
    body: Option<String>,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    ops::skill_preview_create(&paths, client, &name, &description, body)
}

#[tauri::command]
fn skill_apply_create(
    app: tauri::AppHandle,
    client: Client,
    name: String,
    description: String,
    body: Option<String>,
    expected_files: Vec<FilePrecondition>,
) -> Result<aidevhub_core::model::ApplyResult, AppError> {
    let paths = resolve_paths(&app)?;
    ops::skill_apply_create(&paths, client, &name, &description, body, expected_files)
}

#[tauri::command]
fn skill_preview_toggle(
    app: tauri::AppHandle,
    skill_id: String,
    enabled: bool,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    ops::skill_preview_toggle(&paths, &skill_id, enabled)
}

#[tauri::command]
fn skill_apply_toggle(
    app: tauri::AppHandle,
    skill_id: String,
    enabled: bool,
    expected_files: Vec<FilePrecondition>,
) -> Result<aidevhub_core::model::ApplyResult, AppError> {
    let paths = resolve_paths(&app)?;
    ops::skill_apply_toggle(&paths, &skill_id, enabled, expected_files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            runtime_get_info,
            server_list,
            server_get,
            server_preview_toggle,
            server_apply_toggle,
            server_preview_add,
            server_apply_add,
            profile_list,
            profile_create,
            profile_update,
            profile_delete,
            profile_preview_apply,
            profile_apply,
            backup_list,
            backup_preview_rollback,
            backup_apply_rollback,
            skill_list,
            skill_get,
            skill_preview_create,
            skill_apply_create,
            skill_preview_toggle,
            skill_apply_toggle
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
