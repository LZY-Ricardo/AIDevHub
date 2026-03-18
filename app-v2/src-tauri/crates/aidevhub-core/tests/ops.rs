use std::{fs, path::PathBuf};

use aidevhub_core::{
    model::{Client, FilePrecondition, ProfileTargets, Transport},
    ops::{
        backup_apply_rollback, backup_list, backup_preview_rollback, profile_apply,
        profile_create, profile_delete, profile_list, profile_preview_apply, profile_update,
        runtime_get_info, server_apply_add, server_apply_toggle, server_get, server_list,
        server_preview_add, server_preview_toggle, AppPaths,
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
        codex_config_path: base.join("codex.toml"),
        app_local_data_dir: app_local_data_dir.clone(),
        profiles_path: app_local_data_dir.join("profiles.json"),
        disabled_pool_path: app_local_data_dir.join("disabled_pool.json"),
        backups_dir: app_local_data_dir.join("backups"),
        backup_index_path: app_local_data_dir.join("backup_index.json"),
    }
}

fn write(path: &PathBuf, content: &str) {
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).unwrap();
    }
    fs::write(path, content).unwrap();
}

#[test]
fn runtime_info_paths_and_exists() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    let info = runtime_get_info(&paths).unwrap();
    assert!(info.paths.claude_config_path.ends_with("claude.json"));
    assert!(!info.exists.claude_config);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"s1":{"command":"node","args":["a.js"]}}}"#,
    );
    let info2 = runtime_get_info(&paths).unwrap();
    assert!(info2.exists.claude_config);
}

#[test]
fn claude_toggle_moves_between_config_and_disabled_pool() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"s1":{"command":"node","args":["a.js"],"env":{"API_KEY":"x"}}},"other":123}"#,
    );

    let p1 = server_preview_toggle(&paths, "claude_code:s1", false).unwrap();
    assert!(p1.summary.will_disable.contains(&"claude_code:s1".to_string()));
    let r1 = server_apply_toggle(&paths, "claude_code:s1", false, preconditions_from_preview(&p1)).unwrap();
    assert!(r1.summary.will_disable.contains(&"claude_code:s1".to_string()));

    let list1 = server_list(&paths, Some(Client::ClaudeCode)).unwrap();
    let s1 = list1.iter().find(|s| s.server_id == "claude_code:s1").unwrap();
    assert!(!s1.enabled);

    let p2 = server_preview_toggle(&paths, "claude_code:s1", true).unwrap();
    assert!(p2.summary.will_enable.contains(&"claude_code:s1".to_string()));
    let _r2 = server_apply_toggle(&paths, "claude_code:s1", true, preconditions_from_preview(&p2)).unwrap();

    let list2 = server_list(&paths, Some(Client::ClaudeCode)).unwrap();
    let s1b = list2.iter().find(|s| s.server_id == "claude_code:s1").unwrap();
    assert!(s1b.enabled);
}

#[test]
fn codex_toggle_only_enabled_field() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.codex_config_path,
        r#"
[mcp_servers.alpha]
command = "node"
args = ["server.js"]
enabled = true
"#,
    );

    let p1 = server_preview_toggle(&paths, "codex:alpha", false).unwrap();
    assert!(p1.summary.will_disable.contains(&"codex:alpha".to_string()));
    server_apply_toggle(&paths, "codex:alpha", false, preconditions_from_preview(&p1)).unwrap();

    let s = fs::read_to_string(&paths.codex_config_path).unwrap();
    assert!(s.contains("command = \"node\""));
    assert!(s.contains("enabled = false"));
}

#[test]
fn precondition_failed_when_file_changes_after_preview() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.codex_config_path,
        r#"
[mcp_servers.alpha]
command = "node"
enabled = true
"#,
    );

    let p1 = server_preview_toggle(&paths, "codex:alpha", false).unwrap();
    // external change
    write(
        &paths.codex_config_path,
        r#"
[mcp_servers.alpha]
command = "node"
enabled = true
# changed
"#,
    );

    let err = server_apply_toggle(&paths, "codex:alpha", false, preconditions_from_preview(&p1)).unwrap_err();
    assert_eq!(err.code, "PRECONDITION_FAILED");
}

#[test]
fn profile_apply_converges_claude_enabled_set_and_warns_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"a":{"command":"node"},"b":{"command":"node"}}}"#,
    );
    // pool has c
    write(
        &paths.disabled_pool_path,
        r#"{"c":{"command":"node","args":["c.js"]}}"#,
    );

    let prof = profile_create(
        &paths,
        "p1",
        ProfileTargets {
            claude_code: vec!["claude_code:b".to_string(), "claude_code:c".to_string(), "claude_code:missing".to_string()],
            codex: vec![],
        },
    )
    .unwrap();

    let prev = profile_preview_apply(&paths, &prof.profile_id, Client::ClaudeCode).unwrap();
    assert!(prev.warnings.iter().any(|w| w.code == "MISSING_SERVER"));
    profile_apply(&paths, &prof.profile_id, Client::ClaudeCode, preconditions_from_preview(&prev)).unwrap();

    let list = server_list(&paths, Some(Client::ClaudeCode)).unwrap();
    let a = list.iter().find(|s| s.server_id == "claude_code:a").unwrap();
    let b = list.iter().find(|s| s.server_id == "claude_code:b").unwrap();
    let c = list.iter().find(|s| s.server_id == "claude_code:c").unwrap();
    assert!(!a.enabled);
    assert!(b.enabled);
    assert!(c.enabled);
}

#[test]
fn apply_creates_backup_and_backup_list_filters() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"s1":{"command":"node"}}}"#,
    );

    let prev = server_preview_toggle(&paths, "claude_code:s1", false).unwrap();
    let _ = server_apply_toggle(&paths, "claude_code:s1", false, preconditions_from_preview(&prev)).unwrap();

    let all = backup_list(&paths, None).unwrap();
    assert!(!all.is_empty());

    let only_claude = backup_list(&paths, Some(paths.claude_config_path.to_string_lossy().to_string())).unwrap();
    assert!(!only_claude.is_empty());
    assert!(only_claude.iter().all(|r| r.target_path.ends_with("claude.json")));
}

#[test]
fn rollback_preview_and_apply_restores_file() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"s1":{"command":"node"}}}"#,
    );
    let prev = server_preview_toggle(&paths, "claude_code:s1", false).unwrap();
    let _ = server_apply_toggle(&paths, "claude_code:s1", false, preconditions_from_preview(&prev)).unwrap();
    let backups = backup_list(&paths, Some(paths.claude_config_path.to_string_lossy().to_string())).unwrap();
    let b0 = backups.first().unwrap().backup_id.clone();

    let prev_rb = backup_preview_rollback(&paths, &b0).unwrap();
    let expected = preconditions_from_preview(&prev_rb);
    let _ = backup_apply_rollback(&paths, &b0, expected).unwrap();

    let s = fs::read_to_string(&paths.claude_config_path).unwrap();
    assert!(s.contains("\"s1\""));
}

#[test]
fn profile_crud_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    let p = profile_create(
        &paths,
        "p1",
        ProfileTargets {
            claude_code: vec![],
            codex: vec!["codex:x".to_string()],
        },
    )
    .unwrap();
    let all = profile_list(&paths).unwrap();
    assert_eq!(all.len(), 1);

    let p2 = profile_update(&paths, &p.profile_id, Some("p2".to_string()), None).unwrap();
    assert_eq!(p2.name, "p2");

    profile_delete(&paths, &p.profile_id).unwrap();
    let all2 = profile_list(&paths).unwrap();
    assert!(all2.is_empty());
}

#[test]
fn add_server_preview_and_apply_for_codex_and_claude() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    let prev_c = server_preview_add(
        &paths,
        Client::Codex,
        "alpha",
        Transport::Stdio,
        serde_json::json!({"command":"node","args":["a.js"]})
            .as_object()
            .unwrap()
            .clone(),
    )
    .unwrap();
    server_apply_add(
        &paths,
        Client::Codex,
        "alpha",
        Transport::Stdio,
        serde_json::json!({"command":"node","args":["a.js"]})
            .as_object()
            .unwrap()
            .clone(),
        preconditions_from_preview(&prev_c),
    )
    .unwrap();

    let got = server_get(&paths, "codex:alpha", false).unwrap();
    assert!(got.enabled);

    let prev_cl = server_preview_add(
        &paths,
        Client::ClaudeCode,
        "s1",
        Transport::Http,
        serde_json::json!({"url":"http://localhost:8080/mcp"})
            .as_object()
            .unwrap()
            .clone(),
    )
    .unwrap();
    server_apply_add(
        &paths,
        Client::ClaudeCode,
        "s1",
        Transport::Http,
        serde_json::json!({"url":"http://localhost:8080/mcp"})
            .as_object()
            .unwrap()
            .clone(),
        preconditions_from_preview(&prev_cl),
    )
    .unwrap();
    let got2 = server_get(&paths, "claude_code:s1", false).unwrap();
    assert!(got2.enabled);
    assert_eq!(got2.transport, Transport::Http);
}
