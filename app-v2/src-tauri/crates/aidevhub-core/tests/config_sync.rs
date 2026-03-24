use std::{collections::BTreeSet, fs, path::PathBuf};

use aidevhub_core::{
    config_sync::{config_check_updates, config_ignore_updates},
    model::{Client, ConfigIgnoreCondition, ConfigSourceKind},
    ops::AppPaths,
};

fn mk_paths(tmp: &tempfile::TempDir) -> AppPaths {
    let base = tmp.path().to_path_buf();
    let app_local_data_dir = base.join("appdata");
    AppPaths {
        claude_config_path: base.join("claude.json"),
        claude_commands_dir: base.join(".claude").join("commands"),
        claude_commands_disabled_dir: base.join(".claude").join("commands_disabled"),
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

fn write(path: &PathBuf, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn write_skill_file(dir: &PathBuf, name: &str, content: &str) {
    let path = dir.join(name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn write_skill_bytes(dir: &PathBuf, name: &str, content: &[u8]) {
    let path = dir.join(name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn seed_all_sources(paths: &AppPaths) {
    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"demo":{"command":"node","args":["server.js"]}}}"#,
    );
    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["server.js"]
"#,
    );
    write_skill_file(
        &paths.claude_commands_dir,
        "alpha.md",
        "# Alpha\n\nClaude command",
    );
    write_skill_file(
        &paths.codex_skills_dir,
        "beta/SKILL.md",
        "---\nname: beta\n---\n\nCodex skill",
    );
}

fn establish_baseline(paths: &AppPaths) {
    let check = config_check_updates(paths).unwrap();
    if check.updates.is_empty() {
        return;
    }

    let conditions = check
        .updates
        .iter()
        .map(|item| ConfigIgnoreCondition {
            source_id: item.source_id.clone(),
            current_sha256: item.current_sha256.clone(),
        })
        .collect();
    config_ignore_updates(paths, conditions).unwrap();
}

#[test]
fn first_check_reports_non_empty_sources_when_snapshots_are_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    seed_all_sources(&paths);

    let first = config_check_updates(&paths).unwrap();
    assert_eq!(first.updates.len(), 4);
    assert!(!paths.app_local_data_dir.join("config_snapshots.json").exists());

    let second = config_check_updates(&paths).unwrap();
    assert_eq!(second.updates.len(), 4);
}

#[test]
fn first_check_with_empty_sources_creates_empty_snapshot_without_updates() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    let first = config_check_updates(&paths).unwrap();
    assert!(first.updates.is_empty());
    assert!(paths.app_local_data_dir.join("config_snapshots.json").exists());

    let second = config_check_updates(&paths).unwrap();
    assert!(second.updates.is_empty());
}

#[test]
fn detects_changes_for_all_logical_sources() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    seed_all_sources(&paths);
    establish_baseline(&paths);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"demo":{"command":"node","args":["server.js","--new"]}}}"#,
    );
    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["server.js", "--new"]
"#,
    );
    write_skill_file(
        &paths.claude_commands_disabled_dir,
        "gamma.md",
        "# Gamma\n\nDisabled command",
    );
    write_skill_file(
        &paths.codex_skills_disabled_dir,
        "delta/SKILL.md",
        "---\nname: delta\n---\n\nDisabled skill",
    );

    let check = config_check_updates(&paths).unwrap();
    assert_eq!(check.updates.len(), 4);

    let ids: BTreeSet<_> = check.updates.iter().map(|u| u.source_id.as_str()).collect();
    assert!(ids.contains("claudecode.mcp.json"));
    assert!(ids.contains("codex.mcp.json"));
    assert!(ids.contains("claudecode.skill.json"));
    assert!(ids.contains("codex.skill.json"));

    let claude_mcp = check
        .updates
        .iter()
        .find(|u| u.source_id == "claudecode.mcp.json")
        .unwrap();
    assert_eq!(claude_mcp.kind, ConfigSourceKind::Mcp);
    assert!(claude_mcp.requires_confirm_sync);
    assert_eq!(claude_mcp.confirm_sync_available, Some(true));

    let codex_skill = check
        .updates
        .iter()
        .find(|u| u.source_id == "codex.skill.json")
        .unwrap();
    assert_eq!(codex_skill.kind, ConfigSourceKind::Skill);
    assert!(!codex_skill.requires_confirm_sync);
    assert_eq!(codex_skill.confirm_sync_available, None);
}

#[test]
fn ignore_same_version_and_prompt_again_after_next_change() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    seed_all_sources(&paths);
    establish_baseline(&paths);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["server.js", "--one"]
"#,
    );
    let first_change = config_check_updates(&paths).unwrap();
    assert_eq!(first_change.updates.len(), 1);
    assert_eq!(first_change.updates[0].source_id, "codex.mcp.json");
    let seen_sha = first_change.updates[0].current_sha256.clone();

    config_ignore_updates(
        &paths,
        vec![ConfigIgnoreCondition {
            source_id: "codex.mcp.json".to_string(),
            current_sha256: seen_sha,
        }],
    )
    .unwrap();
    let after_ignore = config_check_updates(&paths).unwrap();
    assert!(after_ignore.updates.is_empty());

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["server.js", "--two"]
"#,
    );
    let next_change = config_check_updates(&paths).unwrap();
    assert_eq!(next_change.updates.len(), 1);
    assert_eq!(next_change.updates[0].source_id, "codex.mcp.json");
}

#[test]
fn ignore_rejects_when_source_changed_after_user_seen_version() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    seed_all_sources(&paths);
    establish_baseline(&paths);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["server.js", "--one"]
"#,
    );
    let first_change = config_check_updates(&paths).unwrap();
    let seen_sha = first_change.updates[0].current_sha256.clone();

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["server.js", "--two"]
"#,
    );

    let err = config_ignore_updates(
        &paths,
        vec![ConfigIgnoreCondition {
            source_id: "codex.mcp.json".to_string(),
            current_sha256: seen_sha,
        }],
    )
    .unwrap_err();

    assert_eq!(err.code, "PRECONDITION_FAILED");
}

#[test]
fn broken_mcp_text_keeps_diff_but_disables_confirm_sync() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    seed_all_sources(&paths);
    establish_baseline(&paths);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"demo":{"command":"node","args":["server.js"]}}"#,
    );
    let check = config_check_updates(&paths).unwrap();

    assert_eq!(check.updates.len(), 1);
    let item = &check.updates[0];
    assert_eq!(item.source_id, "claudecode.mcp.json");
    assert!(item.requires_confirm_sync);
    assert_eq!(item.confirm_sync_available, Some(false));
    assert!(!item.diff_unified.trim().is_empty());
}

#[test]
fn update_item_exposes_client_for_frontend_mapping() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    seed_all_sources(&paths);
    establish_baseline(&paths);

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"demo":{"command":"node","args":["server.js","--changed"]}}}"#,
    );
    let check = config_check_updates(&paths).unwrap();
    assert_eq!(check.updates.len(), 1);
    assert_eq!(check.updates[0].client, Client::ClaudeCode);
}

#[test]
fn corrupted_snapshot_file_is_recovered_to_safe_state() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    seed_all_sources(&paths);
    establish_baseline(&paths);

    let snapshot_path = paths.app_local_data_dir.join("config_snapshots.json");
    write(&snapshot_path, "{not-valid-json");

    let recovered = config_check_updates(&paths).unwrap();
    assert!(recovered.updates.is_empty());

    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"demo":{"command":"node","args":["server.js","--after-recover"]}}}"#,
    );
    let changed = config_check_updates(&paths).unwrap();
    assert_eq!(changed.updates.len(), 1);
    assert_eq!(changed.updates[0].source_id, "claudecode.mcp.json");
}

#[test]
fn skill_snapshot_keeps_binary_assets_as_text_placeholders() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    seed_all_sources(&paths);
    write_skill_bytes(
        &paths.codex_skills_dir,
        "openai-docs/assets/openai.png",
        &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00],
    );

    let check = config_check_updates(&paths).unwrap();
    let codex_skill = check
        .updates
        .iter()
        .find(|u| u.source_id == "codex.skill.json")
        .unwrap();

    assert!(codex_skill.diff_unified.contains("openai-docs/assets/openai.png"));
    assert!(codex_skill.diff_unified.contains("[binary file omitted"));
}
