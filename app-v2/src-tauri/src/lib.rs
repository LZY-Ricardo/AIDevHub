use std::path::PathBuf;

use aidevhub_core::model::{
    AppError, AppSettings, Client, ConfigAcceptMcpResponse, ConfigCheckUpdatesResponse,
    ConfigIgnoreCondition, ConfigIgnoreUpdatesResponse, DeploymentTargetType, FilePrecondition,
    HealthCheckResult, ManagedSkillView, McpRegistryExternalDiff, ProfileTargets,
    RuntimeGetInfoResponse, ServerNotes, SkillCatalogEntry, SkillDeployment, SkillRepoGetResponse,
    SkillSyncEvent, SkillTargetProfile, Transport,
};
use aidevhub_core::ops::{self, AppPaths};
use serde::Serialize;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_dialog::DialogExt;

async fn run_blocking_command<T, F>(job: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("blocking task join error: {e}")))?
}

fn resolve_paths(app: &tauri::AppHandle) -> Result<AppPaths, AppError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| AppError::new("IO_ERROR", format!("home_dir: {e}")))?;

    let claude_config_path = home.join(".claude.json");
    let claude_commands_dir = home.join(".claude").join("commands");
    let claude_commands_disabled_dir = home.join(".claude").join("commands_disabled");
    let claude_skills_dir = home.join(".claude").join("skills");
    let claude_skills_disabled_dir = home.join(".claude").join("skills_disabled");

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
        claude_skills_dir,
        claude_skills_disabled_dir,
        codex_config_path,
        codex_skills_dir,
        codex_skills_disabled_dir,
        app_local_data_dir: app_local_data_dir.clone(),
        skill_store_root: app_local_data_dir.join("skill-store"),
        skill_repo_root: app_local_data_dir.join("skill-store").join("repo"),
        skill_indexes_root: app_local_data_dir.join("skill-store").join("indexes"),
        skill_index_path: app_local_data_dir
            .join("skill-store")
            .join("indexes")
            .join("skill_index.json"),
        profiles_path: app_local_data_dir.join("profiles.json"),
        mcp_notes_path: app_local_data_dir.join("mcp_notes.json"),
        mcp_registry_path: app_local_data_dir.join("mcp_registry.json"),
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
fn pick_directory(app: tauri::AppHandle, initial: Option<String>) -> Result<Option<String>, AppError> {
    let mut dialog = app.dialog().file();
    if let Some(initial) = initial.as_deref().filter(|value| !value.trim().is_empty()) {
        dialog = dialog.set_directory(initial);
    }

    Ok(dialog
        .blocking_pick_folder()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn validate_project_root(project_root: String) -> Result<String, AppError> {
    aidevhub_core::skill_repo::validate_project_root_input(&project_root)
}

#[tauri::command]
async fn server_list(
    app: tauri::AppHandle,
    client: Option<Client>,
) -> Result<Vec<aidevhub_core::model::ServerRecord>, AppError> {
    let paths = resolve_paths(&app)?;
    run_blocking_command(move || ops::server_list(&paths, client)).await
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
fn server_get_edit_session(
    app: tauri::AppHandle,
    server_id: String,
) -> Result<aidevhub_core::model::ServerEditSession, AppError> {
    let paths = resolve_paths(&app)?;
    ops::server_get_edit_session(&paths, &server_id)
}

#[tauri::command]
fn server_notes_get(
    app: tauri::AppHandle,
    server_id: String,
) -> Result<aidevhub_core::model::ServerNotes, AppError> {
    let paths = resolve_paths(&app)?;
    ops::mcp_notes_get(&paths, &server_id)
}

#[tauri::command]
fn server_notes_put(
    app: tauri::AppHandle,
    server_id: String,
    notes: ServerNotes,
) -> Result<aidevhub_core::model::ServerNotes, AppError> {
    let paths = resolve_paths(&app)?;
    ops::mcp_notes_put(&paths, &server_id, notes)
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
fn server_preview_edit(
    app: tauri::AppHandle,
    server_id: String,
    transport: Transport,
    payload: serde_json::Value,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    let cfg = payload
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::new("VALIDATION_ERROR", "payload must be an object"))?;
    ops::server_preview_edit(&paths, &server_id, transport, cfg)
}

#[tauri::command]
fn server_apply_edit(
    app: tauri::AppHandle,
    server_id: String,
    transport: Transport,
    payload: serde_json::Value,
    expected_files: Vec<FilePrecondition>,
) -> Result<aidevhub_core::model::ApplyResult, AppError> {
    let paths = resolve_paths(&app)?;
    let cfg = payload
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::new("VALIDATION_ERROR", "payload must be an object"))?;
    ops::server_apply_edit(&paths, &server_id, transport, cfg, expected_files)
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
async fn backup_list(
    app: tauri::AppHandle,
    target_path: Option<String>,
) -> Result<Vec<aidevhub_core::model::BackupRecord>, AppError> {
    let paths = resolve_paths(&app)?;
    run_blocking_command(move || ops::backup_list(&paths, target_path)).await
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
async fn config_check_updates(
    app: tauri::AppHandle,
) -> Result<ConfigCheckUpdatesResponse, AppError> {
    let paths = resolve_paths(&app)?;
    run_blocking_command(move || aidevhub_core::config_sync::config_check_updates(&paths)).await
}

#[tauri::command]
fn config_ignore_updates(
    app: tauri::AppHandle,
    conditions: Vec<ConfigIgnoreCondition>,
) -> Result<ConfigIgnoreUpdatesResponse, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::config_sync::config_ignore_updates(&paths, conditions)
}

#[tauri::command]
fn config_accept_mcp_updates(
    app: tauri::AppHandle,
    source_id: String,
    current_sha256: String,
    client: Client,
) -> Result<ConfigAcceptMcpResponse, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::config_sync::config_accept_mcp_updates(&paths, source_id, current_sha256, client)
}

#[tauri::command]
fn mcp_check_registry_external_diff(
    app: tauri::AppHandle,
    client: Client,
) -> Result<McpRegistryExternalDiff, AppError> {
    let paths = resolve_paths(&app)?;
    ops::mcp_check_registry_external_diff(&paths, client)
}

#[tauri::command]
fn mcp_preview_sync_registry_to_external(
    app: tauri::AppHandle,
    client: Client,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    ops::mcp_preview_sync_registry_to_external(&paths, client)
}

#[tauri::command]
fn mcp_apply_sync_registry_to_external(
    app: tauri::AppHandle,
    client: Client,
    expected_files: Vec<FilePrecondition>,
) -> Result<aidevhub_core::model::ApplyResult, AppError> {
    let paths = resolve_paths(&app)?;
    ops::mcp_apply_sync_registry_to_external(&paths, client, expected_files)
}

#[tauri::command]
async fn settings_get(app: tauri::AppHandle) -> Result<AppSettings, AppError> {
    let paths = resolve_paths(&app)?;
    run_blocking_command(move || aidevhub_core::app_settings::load_settings(&paths)).await
}

#[tauri::command]
fn settings_put(app: tauri::AppHandle, settings: AppSettings) -> Result<AppSettings, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::app_settings::save_settings(&paths, settings)
}

#[tauri::command]
async fn skill_list(
    app: tauri::AppHandle,
    client: Option<Client>,
    scope: Option<String>,
) -> Result<Vec<aidevhub_core::model::SkillRecord>, AppError> {
    let paths = resolve_paths(&app)?;
    run_blocking_command(move || ops::skill_list(&paths, client, scope)).await
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
fn skill_repo_list(app: tauri::AppHandle) -> Result<Vec<ManagedSkillView>, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::list_repo_skills(&paths)
}

#[tauri::command]
fn skill_repo_get(
    app: tauri::AppHandle,
    skill_id: String,
) -> Result<SkillRepoGetResponse, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::get_repo_skill(&paths, &skill_id)
}

#[tauri::command]
fn skill_repo_preview_import(
    app: tauri::AppHandle,
    client: Client,
    name: String,
    source_path: String,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::preview_import_skill(
        &paths,
        client,
        &name,
        &PathBuf::from(source_path),
    )
}

#[tauri::command]
fn skill_repo_apply_import(
    app: tauri::AppHandle,
    client: Client,
    name: String,
    source_path: String,
    _expected_files: Vec<FilePrecondition>,
) -> Result<SkillCatalogEntry, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::apply_import_skill(
        &paths,
        client,
        &name,
        &PathBuf::from(source_path),
    )
}

#[tauri::command]
fn skill_deployment_list(
    app: tauri::AppHandle,
    skill_id: Option<String>,
) -> Result<Vec<SkillDeployment>, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::list_deployments(&paths, skill_id.as_deref())
}

#[tauri::command]
fn skill_deployment_preview_add(
    app: tauri::AppHandle,
    skill_id: String,
    target_type: DeploymentTargetType,
    project_root: Option<String>,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::preview_deployment_add(&paths, &skill_id, target_type, project_root)
}

#[tauri::command]
fn skill_deployment_apply_add(
    app: tauri::AppHandle,
    skill_id: String,
    target_type: DeploymentTargetType,
    project_root: Option<String>,
    expected_files: Vec<FilePrecondition>,
) -> Result<SkillDeployment, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::apply_deployment_add(
        &paths,
        &skill_id,
        target_type,
        project_root,
        expected_files,
    )
}

#[tauri::command]
fn skill_deployment_preview_remove(
    app: tauri::AppHandle,
    deployment_id: String,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::preview_deployment_remove(&paths, &deployment_id)
}

#[tauri::command]
fn skill_deployment_apply_remove(
    app: tauri::AppHandle,
    deployment_id: String,
    expected_files: Vec<FilePrecondition>,
) -> Result<SkillDeployment, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::apply_deployment_remove(&paths, &deployment_id, expected_files)
}

#[tauri::command]
fn skill_deployment_check_one(
    app: tauri::AppHandle,
    deployment_id: String,
) -> Result<SkillDeployment, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::check_deployment_status(&paths, &deployment_id)
}

#[tauri::command]
fn skill_deployment_preview_redeploy(
    app: tauri::AppHandle,
    deployment_id: String,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::preview_redeploy_outdated_deployment(&paths, &deployment_id)
}

#[tauri::command]
fn skill_deployment_apply_redeploy(
    app: tauri::AppHandle,
    deployment_id: String,
    expected_files: Vec<FilePrecondition>,
) -> Result<SkillDeployment, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::apply_redeploy_outdated_deployment(
        &paths,
        &deployment_id,
        expected_files,
    )
}

#[tauri::command]
fn skill_target_profile_list(app: tauri::AppHandle) -> Result<Vec<SkillTargetProfile>, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::list_target_profiles(&paths)
}

#[tauri::command]
fn skill_sync_event_list(
    app: tauri::AppHandle,
    skill_id: Option<String>,
) -> Result<Vec<SkillSyncEvent>, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::list_sync_events(&paths, skill_id.as_deref())
}

#[tauri::command]
fn skill_repo_preview_sync_from_deployment(
    app: tauri::AppHandle,
    deployment_id: String,
) -> Result<aidevhub_core::model::WritePreview, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::preview_sync_from_deployment(&paths, &deployment_id)
}

#[tauri::command]
fn skill_repo_apply_sync_from_deployment(
    app: tauri::AppHandle,
    deployment_id: String,
    expected_files: Vec<FilePrecondition>,
) -> Result<SkillDeployment, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::skill_repo::apply_sync_from_deployment(&paths, &deployment_id, expected_files)
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
    let _ = client;
    aidevhub_core::skill_repo::preview_create_repo_skill(&paths, &name, &name, &description, body)
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
    let _ = (client, expected_files);
    let created = aidevhub_core::skill_repo::apply_create_repo_skill(
        &paths,
        &name,
        &name,
        &description,
        body,
    )?;
    Ok(aidevhub_core::model::ApplyResult {
        backups: Vec::new(),
        summary: aidevhub_core::model::WriteSummary {
            will_add: vec![format!("repo:{}", created.slug)],
            will_enable: Vec::new(),
            will_disable: Vec::new(),
        },
        warnings: Vec::new(),
    })
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

#[tauri::command]
fn mcp_health_check(
    app: tauri::AppHandle,
    server_id: String,
) -> Result<HealthCheckResult, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::health_check::check_single(&paths, &server_id)
}

#[tauri::command]
fn mcp_health_check_all(
    app: tauri::AppHandle,
    client: Client,
) -> Result<Vec<HealthCheckResult>, AppError> {
    let paths = resolve_paths(&app)?;
    aidevhub_core::health_check::check_all(&paths, client)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &quit_item])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("AIDevHub")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_get_info,
            pick_directory,
            validate_project_root,
            server_list,
            server_get,
            server_get_edit_session,
            server_notes_get,
            server_notes_put,
            server_preview_toggle,
            server_apply_toggle,
            server_preview_add,
            server_apply_add,
            server_preview_edit,
            server_apply_edit,
            profile_list,
            profile_create,
            profile_update,
            profile_delete,
            profile_preview_apply,
            profile_apply,
            backup_list,
            backup_preview_rollback,
            backup_apply_rollback,
            config_check_updates,
            config_ignore_updates,
            config_accept_mcp_updates,
            mcp_check_registry_external_diff,
            mcp_preview_sync_registry_to_external,
            mcp_apply_sync_registry_to_external,
            settings_get,
            settings_put,
            skill_list,
            skill_get,
            skill_repo_list,
            skill_repo_get,
            skill_repo_preview_import,
            skill_repo_apply_import,
            skill_deployment_list,
            skill_deployment_preview_add,
            skill_deployment_apply_add,
            skill_deployment_preview_remove,
            skill_deployment_apply_remove,
            skill_deployment_check_one,
            skill_deployment_preview_redeploy,
            skill_deployment_apply_redeploy,
            skill_target_profile_list,
            skill_sync_event_list,
            skill_repo_preview_sync_from_deployment,
            skill_repo_apply_sync_from_deployment,
            skill_preview_create,
            skill_apply_create,
            skill_preview_toggle,
            skill_apply_toggle,
            mcp_health_check,
            mcp_health_check_all
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::run_blocking_command;
    use aidevhub_core::model::AppError;

    #[test]
    fn run_blocking_command_returns_ok_result() {
        let result = tauri::async_runtime::block_on(async {
            run_blocking_command(|| Ok::<_, AppError>(42)).await
        })
        .unwrap();

        assert_eq!(result, 42);
    }

    #[test]
    fn run_blocking_command_preserves_app_error() {
        let err = tauri::async_runtime::block_on(async {
            run_blocking_command(|| Err::<(), _>(AppError::new("VALIDATION_ERROR", "boom"))).await
        })
        .unwrap_err();

        assert_eq!(err.code, "VALIDATION_ERROR");
        assert_eq!(err.message, "boom");
    }
}
