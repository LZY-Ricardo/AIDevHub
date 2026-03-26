use std::fs;

use aidevhub_core::{
    app_settings::{load_settings, save_settings},
    model::{AppSettings, McpDiffCheckMode},
    ops::AppPaths,
};

fn mk_paths(tmp: &tempfile::TempDir) -> AppPaths {
    let base = tmp.path().to_path_buf();
    let app_local_data_dir = base.join("appdata");
    AppPaths {
        claude_config_path: base.join("claude.json"),
        claude_commands_dir: base.join(".claude").join("commands"),
        claude_commands_disabled_dir: base.join(".claude").join("commands_disabled"),
        claude_skills_dir: base.join(".claude").join("skills"),
        claude_skills_disabled_dir: base.join(".claude").join("skills_disabled"),
        codex_config_path: base.join("codex.toml"),
        codex_skills_dir: base.join(".codex").join("skills"),
        codex_skills_disabled_dir: base.join(".codex").join("skills_disabled"),
        app_local_data_dir: app_local_data_dir.clone(),
        profiles_path: app_local_data_dir.join("profiles.json"),
        mcp_notes_path: app_local_data_dir.join("mcp_notes.json"),
        mcp_registry_path: app_local_data_dir.join("mcp_registry.json"),
        disabled_pool_path: app_local_data_dir.join("disabled_pool.json"),
        backups_dir: app_local_data_dir.join("backups"),
        backup_index_path: app_local_data_dir.join("backup_index.json"),
    }
}

#[test]
fn settings_get_returns_default_mode_when_file_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    let settings = load_settings(&paths).unwrap();
    assert_eq!(settings.mcp_diff_check_mode, McpDiffCheckMode::OpenDiff);
}

#[test]
fn settings_put_roundtrip_persists_summary_only_mode() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    save_settings(
        &paths,
        AppSettings {
            mcp_diff_check_mode: McpDiffCheckMode::SummaryOnly,
        },
    )
    .unwrap();

    let settings = load_settings(&paths).unwrap();
    assert_eq!(settings.mcp_diff_check_mode, McpDiffCheckMode::SummaryOnly);

    let persisted = fs::read_to_string(paths.app_local_data_dir.join("app_settings.json")).unwrap();
    let persisted_json: serde_json::Value = serde_json::from_str(&persisted).unwrap();
    assert_eq!(
        persisted_json,
        serde_json::json!({
            "mcp_diff_check_mode": "summary_only"
        })
    );
}
