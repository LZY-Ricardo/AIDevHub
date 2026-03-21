use aidevhub_core::{
    model::{BackupOp, Client, FilePrecondition, Transport},
    ops::{server_apply_add, server_apply_edit, server_preview_add, server_preview_edit, AppPaths},
};

fn preconditions_from_preview(preview: &aidevhub_core::model::WritePreview) -> Vec<FilePrecondition> {
    preview
        .files
        .iter()
        .map(|f| FilePrecondition {
            path: f.path.clone(),
            expected_before_sha256: f.before_sha256.clone(),
        })
        .collect()
}

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
fn add_and_edit_use_distinct_backup_ops() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"demo":{"command":"node","args":["old.js"]}}}"#,
    );

    let add_preview = server_preview_add(
        &paths,
        Client::ClaudeCode,
        "new_one",
        Transport::Stdio,
        serde_json::json!({"command":"node","args":["new.js"]})
            .as_object()
            .unwrap()
            .clone(),
    )
    .unwrap();
    let add_result = server_apply_add(
        &paths,
        Client::ClaudeCode,
        "new_one",
        Transport::Stdio,
        serde_json::json!({"command":"node","args":["new.js"]})
            .as_object()
            .unwrap()
            .clone(),
        preconditions_from_preview(&add_preview),
    )
    .unwrap();
    assert_eq!(add_result.backups.len(), 1);
    assert!(matches!(add_result.backups[0].op, BackupOp::AddServer));

    let edit_preview = server_preview_edit(
        &paths,
        "claude_code:demo",
        Transport::Stdio,
        serde_json::json!({"command":"node","args":["updated.js"]})
            .as_object()
            .unwrap()
            .clone(),
    )
    .unwrap();
    let edit_result = server_apply_edit(
        &paths,
        "claude_code:demo",
        Transport::Stdio,
        serde_json::json!({"command":"node","args":["updated.js"]})
            .as_object()
            .unwrap()
            .clone(),
        preconditions_from_preview(&edit_preview),
    )
    .unwrap();
    assert_eq!(edit_result.backups.len(), 1);
    assert!(matches!(edit_result.backups[0].op, BackupOp::EditServer));
}
