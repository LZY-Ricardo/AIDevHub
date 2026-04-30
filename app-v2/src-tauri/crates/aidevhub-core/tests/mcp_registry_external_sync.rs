use std::{fs, path::PathBuf};

use aidevhub_core::{
    model::{Client, FilePrecondition},
    ops::{
        mcp_apply_sync_registry_to_external, mcp_check_registry_external_diff,
        mcp_preview_sync_registry_to_external, AppPaths,
    },
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
        agent_skills_dir: base.join(".agents").join("skills"),
        codex_config_path: base.join("codex.toml"),
        codex_skills_dir: base.join(".codex").join("skills"),
        codex_skills_disabled_dir: base.join(".codex").join("skills_disabled"),
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
    }
}

fn write(path: &PathBuf, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn write_registry(path: &PathBuf, content: serde_json::Value) {
    write(path, &serde_json::to_string_pretty(&content).unwrap());
}

fn preconditions_from_preview(
    preview: &aidevhub_core::model::WritePreview,
) -> Vec<FilePrecondition> {
    preview
        .files
        .iter()
        .map(|file| FilePrecondition {
            path: file.path.clone(),
            expected_before_sha256: file.before_sha256.clone(),
        })
        .collect()
}

fn claude_mcp_value_span(text: &str) -> (usize, usize) {
    let key = "\"mcpServers\"";
    let key_pos = text.find(key).unwrap();
    let mut i = key_pos + key.len();
    let bytes = text.as_bytes();
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    assert_eq!(bytes[i], b':');
    i += 1;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    let start = i;
    assert_eq!(bytes[start], b'{');
    let mut depth = 0usize;
    let mut in_str = false;
    let mut esc = false;
    while i < bytes.len() {
        let b = bytes[i];
        if in_str {
            if esc {
                esc = false;
            } else if b == b'\\' {
                esc = true;
            } else if b == b'"' {
                in_str = false;
            }
        } else if b == b'"' {
            in_str = true;
        } else if b == b'{' {
            depth += 1;
        } else if b == b'}' {
            depth -= 1;
            if depth == 0 {
                return (start, i + 1);
            }
        }
        i += 1;
    }
    panic!("missing mcpServers object end");
}

#[test]
fn claude_diff_only_compares_mcpservers_fragment() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths.mcp_registry_path,
        serde_json::json!({
            "servers": [
                {
                    "server_id": "claude_code:demo",
                    "client": "claude_code",
                    "name": "demo",
                    "transport": "stdio",
                    "enabled": true,
                    "payload": { "command": "node", "args": ["demo.js"] },
                    "source_origin": "claudecode.mcp.json",
                    "updated_at": "2026-03-25T00:00:00Z"
                }
            ]
        }),
    );
    write(
        &paths.claude_config_path,
        r#"{
  "theme": "light",
  "foo": {"bar": 1},
  "mcpServers": {
    "demo": { "command": "node", "args": ["demo.js"] }
  }
}"#,
    );

    let diff = mcp_check_registry_external_diff(&paths, Client::ClaudeCode).unwrap();
    assert_eq!(diff.client, Client::ClaudeCode);
    assert!(!diff.has_diff);
    assert_eq!(diff.before_fragment, diff.after_fragment);
    assert!(diff.diff_unified.trim().is_empty());
}

#[test]
fn claude_preview_and_apply_only_changes_mcp_fragment_bytes() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths.mcp_registry_path,
        serde_json::json!({
            "servers": [
                {
                    "server_id": "claude_code:demo",
                    "client": "claude_code",
                    "name": "demo",
                    "transport": "stdio",
                    "enabled": true,
                    "payload": { "command": "node", "args": ["new.js"] },
                    "source_origin": "claudecode.mcp.json",
                    "updated_at": "2026-03-25T00:00:00Z"
                }
            ]
        }),
    );

    let before = "{\"theme\":\"light\",\"x\":[1,2],\"mcpServers\":{\"demo\":{\"command\":\"node\",\"args\":[\"old.js\"]}},\"tail\":true}";
    write(&paths.claude_config_path, before);

    let preview = mcp_preview_sync_registry_to_external(&paths, Client::ClaudeCode).unwrap();
    assert_eq!(preview.files.len(), 1);
    assert!(!preview.files[0].diff_unified.contains("\"theme\""));
    assert!(!preview.files[0].diff_unified.contains("\"tail\""));

    mcp_apply_sync_registry_to_external(
        &paths,
        Client::ClaudeCode,
        preconditions_from_preview(&preview),
    )
    .unwrap();

    let after = fs::read_to_string(&paths.claude_config_path).unwrap();
    let (b_start, b_end) = claude_mcp_value_span(before);
    let (a_start, a_end) = claude_mcp_value_span(&after);
    let before_without_mcp = format!("{}{}", &before[..b_start], &before[b_end..]);
    let after_without_mcp = format!("{}{}", &after[..a_start], &after[a_end..]);
    assert_eq!(before_without_mcp, after_without_mcp);
    assert!(after.contains("new.js"));
}

#[test]
fn claude_apply_inserts_missing_mcpservers_field_without_touching_other_fields() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths.mcp_registry_path,
        serde_json::json!({
            "servers": [
                {
                    "server_id": "claude_code:demo",
                    "client": "claude_code",
                    "name": "demo",
                    "transport": "stdio",
                    "enabled": true,
                    "payload": { "command": "node", "args": ["new.js"] },
                    "source_origin": "claudecode.mcp.json",
                    "updated_at": "2026-03-25T00:00:00Z"
                }
            ]
        }),
    );

    let before = "{\"theme\":\"light\",\"tail\":true}";
    write(&paths.claude_config_path, before);

    let preview = mcp_preview_sync_registry_to_external(&paths, Client::ClaudeCode).unwrap();
    assert_eq!(preview.files.len(), 1);
    assert!(!preview.files[0].diff_unified.contains("\"theme\""));
    assert!(!preview.files[0].diff_unified.contains("\"tail\""));

    mcp_apply_sync_registry_to_external(
        &paths,
        Client::ClaudeCode,
        preconditions_from_preview(&preview),
    )
    .unwrap();

    let after = fs::read_to_string(&paths.claude_config_path).unwrap();
    assert!(after.starts_with("{\"theme\":\"light\",\"tail\":true,\"mcpServers\":"));
    let parsed: serde_json::Value = serde_json::from_str(&after).unwrap();
    assert_eq!(parsed["theme"], "light");
    assert_eq!(parsed["tail"], true);
    assert_eq!(parsed["mcpServers"]["demo"]["command"], "node");
    assert_eq!(parsed["mcpServers"]["demo"]["args"][0], "new.js");
}

#[test]
fn apply_requires_complete_expected_files_from_preview() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths.mcp_registry_path,
        serde_json::json!({
            "servers": [
                {
                    "server_id": "claude_code:demo",
                    "client": "claude_code",
                    "name": "demo",
                    "transport": "stdio",
                    "enabled": true,
                    "payload": { "command": "node", "args": ["new.js"] },
                    "source_origin": "claudecode.mcp.json",
                    "updated_at": "2026-03-25T00:00:00Z"
                }
            ]
        }),
    );
    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"demo":{"command":"node","args":["old.js"]}}}"#,
    );

    let preview = mcp_preview_sync_registry_to_external(&paths, Client::ClaudeCode).unwrap();
    assert_eq!(preview.files.len(), 1);

    let err = mcp_apply_sync_registry_to_external(&paths, Client::ClaudeCode, vec![]).unwrap_err();
    assert_eq!(err.code, "PRECONDITION_FAILED");
}

#[test]
fn codex_preview_replaces_only_mcp_servers_table() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths.mcp_registry_path,
        serde_json::json!({
            "servers": [
                {
                    "server_id": "codex:alpha",
                    "client": "codex",
                    "name": "alpha",
                    "transport": "stdio",
                    "enabled": true,
                    "payload": { "command": "node", "args": ["alpha.js"], "enabled": true },
                    "source_origin": "codex.mcp.json",
                    "updated_at": "2026-03-25T00:00:00Z"
                }
            ]
        }),
    );
    write(
        &paths.codex_config_path,
        r#"[workspace]
name = "demo"

[mcp_servers.beta]
command = "node"
args = ["beta.js"]
enabled = true
"#,
    );
    let before_registry = fs::read_to_string(&paths.mcp_registry_path).unwrap();

    let preview = mcp_preview_sync_registry_to_external(&paths, Client::Codex).unwrap();
    assert_eq!(preview.files.len(), 1);
    assert_eq!(
        preview.files[0].path,
        paths.codex_config_path.to_string_lossy().to_string()
    );

    mcp_apply_sync_registry_to_external(
        &paths,
        Client::Codex,
        preconditions_from_preview(&preview),
    )
    .unwrap();

    let codex = fs::read_to_string(&paths.codex_config_path).unwrap();
    assert!(codex.contains("[workspace]"));
    assert!(codex.contains("name = \"demo\""));
    assert!(codex.contains("[mcp_servers.alpha]"));
    assert!(!codex.contains("[mcp_servers.beta]"));
    assert_eq!(
        fs::read_to_string(&paths.mcp_registry_path).unwrap(),
        before_registry
    );
}

#[test]
fn malformed_external_config_returns_parse_error() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths.mcp_registry_path,
        serde_json::json!({
            "servers": [
                {
                    "server_id": "claude_code:demo",
                    "client": "claude_code",
                    "name": "demo",
                    "transport": "stdio",
                    "enabled": true,
                    "payload": { "command": "node" },
                    "source_origin": "claudecode.mcp.json",
                    "updated_at": "2026-03-25T00:00:00Z"
                }
            ]
        }),
    );
    write(
        &paths.claude_config_path,
        r#"{"mcpServers":["not-an-object"],"theme":"light"}"#,
    );

    let err = mcp_check_registry_external_diff(&paths, Client::ClaudeCode).unwrap_err();
    assert_eq!(err.code, "PARSE_ERROR");
}
