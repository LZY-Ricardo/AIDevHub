use aidevhub_core::{
    model::Client,
    ops::{server_get, server_list, AppPaths},
};

fn mk_paths(tmp: &tempfile::TempDir) -> AppPaths {
    let base = tmp.path().to_path_buf();
    let app_local_data_dir = base.join("appdata");
    AppPaths {
        claude_config_path: base.join("claude.json"),
        claude_commands_dir: base.join(".claude").join("commands"),
        claude_commands_disabled_dir: base.join(".claude").join("commands-disabled"),
        codex_config_path: base.join("config.toml"),
        codex_skills_dir: base.join(".codex").join("skills"),
        codex_skills_disabled_dir: base.join(".codex").join("skills-disabled"),
        app_local_data_dir: app_local_data_dir.clone(),
        profiles_path: app_local_data_dir.join("profiles.json"),
        disabled_pool_path: app_local_data_dir.join("disabled_pool.json"),
        backups_dir: app_local_data_dir.join("backups"),
        backup_index_path: app_local_data_dir.join("backups").join("index.json"),
        mcp_notes_path: app_local_data_dir.join("mcp_notes.json"),
    }
}

fn write(path: &std::path::Path, s: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, s).unwrap();
}

#[test]
fn disabled_claude_server_uses_disabled_pool_as_source_file() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"enabled_one":{"command":"node"}}}"#,
    );
    write(
        &paths.disabled_pool_path,
        r#"{"disabled_one":{"command":"node","args":["server.js"]}}"#,
    );

    let got = server_get(&paths, "claude_code:disabled_one", false).unwrap();
    assert_eq!(
        got.source_file,
        paths.disabled_pool_path.to_string_lossy().to_string()
    );

    let list = server_list(&paths, Some(Client::ClaudeCode)).unwrap();
    let disabled = list
        .iter()
        .find(|server| server.server_id == "claude_code:disabled_one")
        .unwrap();
    assert_eq!(
        disabled.source_file,
        paths.disabled_pool_path.to_string_lossy().to_string()
    );
}
