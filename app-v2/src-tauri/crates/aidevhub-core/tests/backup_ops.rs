use aidevhub_core::{
    model::{BackupOp, Client, FilePrecondition, ProfileTargets, Transport},
    ops::{
        profile_apply, profile_create, profile_preview_apply, server_apply_add, server_apply_edit,
        server_apply_toggle, server_preview_add, server_preview_edit, server_preview_toggle, AppPaths,
    },
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
        claude_skills_dir: base.join(".claude").join("skills"),
        claude_skills_disabled_dir: base.join(".claude").join("skills-disabled"),
        codex_config_path: base.join("config.toml"),
        codex_skills_dir: base.join(".codex").join("skills"),
        codex_skills_disabled_dir: base.join(".codex").join("skills-disabled"),
        app_local_data_dir: app_local_data_dir.clone(),
        profiles_path: app_local_data_dir.join("profiles.json"),
        disabled_pool_path: app_local_data_dir.join("disabled_pool.json"),
        backups_dir: app_local_data_dir.join("backups"),
        backup_index_path: app_local_data_dir.join("backups").join("index.json"),
        mcp_notes_path: app_local_data_dir.join("mcp_notes.json"),
        mcp_registry_path: app_local_data_dir.join("mcp_registry.json"),
    }
}

fn write(path: &std::path::Path, s: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, s).unwrap();
}

fn write_registry(paths: &AppPaths, servers: Vec<serde_json::Value>) {
    write(
        &paths.mcp_registry_path,
        &serde_json::to_string_pretty(&serde_json::json!({ "servers": servers })).unwrap(),
    );
}

#[test]
fn add_and_edit_use_distinct_backup_ops() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![serde_json::json!({
            "server_id": "claude_code:demo",
            "client": "claude_code",
            "name": "demo",
            "transport": "stdio",
            "enabled": true,
            "payload": { "command": "node", "args": ["old.js"] },
            "source_origin": "claudecode.mcp.json",
            "updated_at": "2026-03-23T00:00:00Z"
        })],
    );
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

#[test]
fn toggle_and_profile_apply_keep_external_backup_op_kinds() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![
            serde_json::json!({
                "server_id": "claude_code:demo",
                "client": "claude_code",
                "name": "demo",
                "transport": "stdio",
                "enabled": true,
                "payload": { "command": "node", "args": ["demo.js"] },
                "source_origin": "claudecode.mcp.json",
                "updated_at": "2026-03-23T00:00:00Z"
            }),
            serde_json::json!({
                "server_id": "claude_code:other",
                "client": "claude_code",
                "name": "other",
                "transport": "stdio",
                "enabled": false,
                "payload": { "command": "node", "args": ["other.js"] },
                "source_origin": "claudecode.mcp.json",
                "updated_at": "2026-03-23T00:00:00Z"
            })
        ],
    );
    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"demo":{"command":"node","args":["demo.js"]}}}"#,
    );

    let toggle_preview = server_preview_toggle(&paths, "claude_code:demo", false).unwrap();
    let toggle_result =
        server_apply_toggle(&paths, "claude_code:demo", false, preconditions_from_preview(&toggle_preview)).unwrap();
    assert_eq!(toggle_result.backups.len(), 1);
    assert!(matches!(toggle_result.backups[0].op, BackupOp::Toggle));

    let profile = profile_create(
        &paths,
        "only-other",
        ProfileTargets {
            claude_code: vec!["claude_code:other".to_string()],
            codex: vec![],
        },
    )
    .unwrap();
    let profile_preview = profile_preview_apply(&paths, &profile.profile_id, Client::ClaudeCode).unwrap();
    let profile_result = profile_apply(
        &paths,
        &profile.profile_id,
        Client::ClaudeCode,
        preconditions_from_preview(&profile_preview),
    )
    .unwrap();
    assert_eq!(profile_result.backups.len(), 1);
    assert!(matches!(profile_result.backups[0].op, BackupOp::ApplyProfile));
}
