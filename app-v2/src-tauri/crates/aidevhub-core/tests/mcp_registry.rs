use std::{fs, path::PathBuf};

use aidevhub_core::{
    config_sync::{config_accept_mcp_updates, config_check_updates, config_ignore_updates},
    model::{Client, ConfigIgnoreCondition},
    ops::AppPaths,
};
use serde_json::Value;

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

fn write(path: &PathBuf, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn read_registry(path: &PathBuf) -> Value {
    let raw = fs::read_to_string(path).unwrap();
    serde_json::from_str(&raw).unwrap()
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
fn accepting_codex_source_writes_codex_slice_into_registry() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.alpha]
command = "node"
args = ["alpha.js"]

[mcp_servers.bravo]
url = "https://example.com/mcp"
enabled = false
"#,
    );

    establish_baseline(&paths);
    write(
        &paths.codex_config_path,
        r#"[mcp_servers.alpha]
command = "node"
args = ["alpha.js", "--changed"]

[mcp_servers.bravo]
url = "https://example.com/mcp"
enabled = false
"#,
    );

    let check = config_check_updates(&paths).unwrap();
    let item = check
        .updates
        .iter()
        .find(|u| u.source_id == "codex.mcp.json")
        .unwrap();

    let before_external = fs::read_to_string(&paths.codex_config_path).unwrap();
    let accepted = config_accept_mcp_updates(
        &paths,
        item.source_id.clone(),
        item.current_sha256.clone(),
        item.client,
    )
    .unwrap();
    assert!(accepted.accepted);
    assert_eq!(fs::read_to_string(&paths.codex_config_path).unwrap(), before_external);

    let registry = read_registry(&paths.mcp_registry_path);
    let servers = registry.get("servers").and_then(Value::as_array).unwrap();
    assert!(servers.iter().any(|s| s.get("server_id").and_then(Value::as_str) == Some("codex:alpha")));
    assert!(servers.iter().any(|s| s.get("server_id").and_then(Value::as_str) == Some("codex:bravo")));
}

#[test]
fn accepting_claude_source_writes_claude_slice_into_registry() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.claude_config_path,
        r#"{
  "mcpServers": {
    "demo": { "command": "node", "args": ["demo.js"] }
  }
}"#,
    );
    establish_baseline(&paths);

    write(
        &paths.claude_config_path,
        r#"{
  "mcpServers": {
    "demo": { "command": "node", "args": ["demo.js", "--changed"] }
  }
}"#,
    );
    let check = config_check_updates(&paths).unwrap();
    let item = check
        .updates
        .iter()
        .find(|u| u.source_id == "claudecode.mcp.json")
        .unwrap();

    config_accept_mcp_updates(
        &paths,
        item.source_id.clone(),
        item.current_sha256.clone(),
        item.client,
    )
    .unwrap();

    let registry = read_registry(&paths.mcp_registry_path);
    let servers = registry.get("servers").and_then(Value::as_array).unwrap();
    let demo = servers
        .iter()
        .find(|s| s.get("server_id").and_then(Value::as_str) == Some("claude_code:demo"))
        .unwrap();
    assert_eq!(demo.get("client").and_then(Value::as_str), Some("claude_code"));
}

#[test]
fn accept_sync_updates_snapshot_baseline_without_touching_external_file() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["demo.js"]
"#,
    );
    establish_baseline(&paths);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["demo.js", "--new"]
"#,
    );
    let changed = config_check_updates(&paths).unwrap();
    let item = changed
        .updates
        .iter()
        .find(|u| u.source_id == "codex.mcp.json")
        .unwrap();
    let before_external = fs::read_to_string(&paths.codex_config_path).unwrap();

    config_accept_mcp_updates(
        &paths,
        item.source_id.clone(),
        item.current_sha256.clone(),
        Client::Codex,
    )
    .unwrap();

    assert_eq!(fs::read_to_string(&paths.codex_config_path).unwrap(), before_external);
    let after_accept = config_check_updates(&paths).unwrap();
    assert!(!after_accept
        .updates
        .iter()
        .any(|u| u.source_id == "codex.mcp.json"));
}

#[test]
fn malformed_external_mcp_content_rejects_accept() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.claude_config_path,
        r#"{
  "mcpServers": {
    "demo": { "command": "node", "args": ["demo.js"] }
  }
}"#,
    );
    establish_baseline(&paths);

    write(
        &paths.claude_config_path,
        r#"{
  "mcpServers": {
    "demo": { "command": "node", "args": ["demo.js"] }
  }"#,
    );
    let changed = config_check_updates(&paths).unwrap();
    let item = changed
        .updates
        .iter()
        .find(|u| u.source_id == "claudecode.mcp.json")
        .unwrap();

    let err = config_accept_mcp_updates(
        &paths,
        item.source_id.clone(),
        item.current_sha256.clone(),
        Client::ClaudeCode,
    )
    .unwrap_err();
    assert_eq!(err.code, "PARSE_ERROR");
}

#[test]
fn accepting_codex_source_preserves_inline_object_payload_fields() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["demo.js"]
env = { API_KEY = "secret", REGION = "cn" }
"#,
    );
    establish_baseline(&paths);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["demo.js", "--changed"]
env = { API_KEY = "secret", REGION = "cn" }
"#,
    );
    let check = config_check_updates(&paths).unwrap();
    let item = check
        .updates
        .iter()
        .find(|u| u.source_id == "codex.mcp.json")
        .unwrap();

    config_accept_mcp_updates(
        &paths,
        item.source_id.clone(),
        item.current_sha256.clone(),
        Client::Codex,
    )
    .unwrap();

    let registry = read_registry(&paths.mcp_registry_path);
    let servers = registry.get("servers").and_then(Value::as_array).unwrap();
    let demo = servers
        .iter()
        .find(|s| s.get("server_id").and_then(Value::as_str) == Some("codex:demo"))
        .unwrap();
    let env = demo
        .get("payload")
        .and_then(Value::as_object)
        .and_then(|payload| payload.get("env"))
        .and_then(Value::as_object)
        .unwrap();
    assert_eq!(env.get("API_KEY").and_then(Value::as_str), Some("secret"));
    assert_eq!(env.get("REGION").and_then(Value::as_str), Some("cn"));
}

#[test]
fn snapshot_write_failure_rolls_back_registry_changes() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    let initial_registry = serde_json::json!({
        "servers": [
            {
                "server_id": "codex:legacy",
                "client": "codex",
                "name": "legacy",
                "transport": "stdio",
                "enabled": true,
                "payload": { "command": "node", "args": ["legacy.js"] },
                "source_origin": "codex.mcp.json",
                "updated_at": "2026-03-23T00:00:00Z"
            }
        ]
    });
    write(
        &paths.mcp_registry_path,
        &serde_json::to_string_pretty(&initial_registry).unwrap(),
    );

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["demo.js"]
"#,
    );
    establish_baseline(&paths);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["demo.js", "--changed"]
"#,
    );
    let check = config_check_updates(&paths).unwrap();
    let item = check
        .updates
        .iter()
        .find(|u| u.source_id == "codex.mcp.json")
        .unwrap();

    let snapshot_path = paths.app_local_data_dir.join("config_snapshots.json");
    fs::remove_file(&snapshot_path).unwrap();
    fs::create_dir_all(&snapshot_path).unwrap();

    let err = config_accept_mcp_updates(
        &paths,
        item.source_id.clone(),
        item.current_sha256.clone(),
        Client::Codex,
    )
    .unwrap_err();
    assert_eq!(err.code, "IO_ERROR");

    let after = read_registry(&paths.mcp_registry_path);
    assert_eq!(after, initial_registry);
}

#[test]
fn accepting_codex_source_preserves_child_table_payload_fields() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["demo.js"]

[mcp_servers.demo.env]
API_KEY = "secret"
REGION = "cn"
"#,
    );
    establish_baseline(&paths);

    write(
        &paths.codex_config_path,
        r#"[mcp_servers.demo]
command = "node"
args = ["demo.js", "--changed"]

[mcp_servers.demo.env]
API_KEY = "secret"
REGION = "cn"
"#,
    );
    let check = config_check_updates(&paths).unwrap();
    let item = check
        .updates
        .iter()
        .find(|u| u.source_id == "codex.mcp.json")
        .unwrap();

    config_accept_mcp_updates(
        &paths,
        item.source_id.clone(),
        item.current_sha256.clone(),
        Client::Codex,
    )
    .unwrap();

    let registry = read_registry(&paths.mcp_registry_path);
    let servers = registry.get("servers").and_then(Value::as_array).unwrap();
    let demo = servers
        .iter()
        .find(|s| s.get("server_id").and_then(Value::as_str) == Some("codex:demo"))
        .unwrap();
    let env = demo
        .get("payload")
        .and_then(Value::as_object)
        .and_then(|payload| payload.get("env"))
        .and_then(Value::as_object)
        .unwrap();
    assert_eq!(env.get("API_KEY").and_then(Value::as_str), Some("secret"));
    assert_eq!(env.get("REGION").and_then(Value::as_str), Some("cn"));
}
