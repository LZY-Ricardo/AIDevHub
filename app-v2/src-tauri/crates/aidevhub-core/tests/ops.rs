use std::{collections::BTreeMap, fs, path::PathBuf};

use aidevhub_core::{
    model::{Client, FilePrecondition, ProfileTargets, ServerNotes, Transport},
    ops::{
        backup_apply_rollback, backup_list, backup_preview_rollback, profile_apply,
        profile_create, profile_delete, profile_list, profile_preview_apply, profile_update,
        mcp_notes_get, mcp_notes_put, runtime_get_info, server_apply_add, server_apply_toggle,
        server_apply_edit, server_get, server_get_edit_session, server_list,
        server_preview_add, server_preview_edit, server_preview_toggle, AppPaths,
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
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn registry_server(
    server_id: &str,
    client: &str,
    name: &str,
    transport: &str,
    enabled: bool,
    payload: serde_json::Value,
) -> serde_json::Value {
    serde_json::json!({
        "server_id": server_id,
        "client": client,
        "name": name,
        "transport": transport,
        "enabled": enabled,
        "payload": payload,
        "source_origin": if client == "codex" { "codex.mcp.json" } else { "claudecode.mcp.json" },
        "updated_at": "2026-03-23T00:00:00Z"
    })
}

fn write_registry(paths: &AppPaths, servers: Vec<serde_json::Value>) {
    write(
        &paths.mcp_registry_path,
        &serde_json::to_string_pretty(&serde_json::json!({ "servers": servers })).unwrap(),
    );
}

#[test]
fn mcp_notes_missing_returns_empty_notes() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    let notes = mcp_notes_get(&paths, "codex:playwright").unwrap();
    assert_eq!(notes.description, "");
    assert!(notes.field_hints.is_empty());
}

#[test]
fn mcp_notes_roundtrip_persists_description_and_field_hints() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    let mut field_hints = BTreeMap::new();
    field_hints.insert("command".to_string(), "用于启动本地 MCP 服务".to_string());
    field_hints.insert("args".to_string(), "传给启动命令的参数".to_string());

    mcp_notes_put(
        &paths,
        "codex:playwright",
        ServerNotes {
            description: "用于浏览器自动化和页面交互".to_string(),
            field_hints,
        },
    )
    .unwrap();

    let notes = mcp_notes_get(&paths, "codex:playwright").unwrap();
    assert_eq!(notes.description, "用于浏览器自动化和页面交互");
    assert_eq!(
        notes.field_hints.get("command").map(String::as_str),
        Some("用于启动本地 MCP 服务")
    );
    assert_eq!(
        notes.field_hints.get("args").map(String::as_str),
        Some("传给启动命令的参数")
    );
}

#[test]
fn mcp_notes_update_does_not_clobber_other_servers() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    mcp_notes_put(
        &paths,
        "codex:playwright",
        ServerNotes {
            description: "浏览器自动化".to_string(),
            field_hints: BTreeMap::from([("command".to_string(), "启动命令".to_string())]),
        },
    )
    .unwrap();
    mcp_notes_put(
        &paths,
        "codex:neon",
        ServerNotes {
            description: "数据库操作".to_string(),
            field_hints: BTreeMap::from([("url".to_string(), "远程 MCP 地址".to_string())]),
        },
    )
    .unwrap();
    mcp_notes_put(
        &paths,
        "codex:playwright",
        ServerNotes {
            description: "浏览器自动化与截图".to_string(),
            field_hints: BTreeMap::from([("args".to_string(), "命令参数".to_string())]),
        },
    )
    .unwrap();

    let playwright = mcp_notes_get(&paths, "codex:playwright").unwrap();
    let neon = mcp_notes_get(&paths, "codex:neon").unwrap();

    assert_eq!(playwright.description, "浏览器自动化与截图");
    assert_eq!(
        playwright.field_hints.get("args").map(String::as_str),
        Some("命令参数")
    );
    assert_eq!(neon.description, "数据库操作");
    assert_eq!(
        neon.field_hints.get("url").map(String::as_str),
        Some("远程 MCP 地址")
    );
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
fn claude_toggle_exports_enabled_state_from_registry() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![registry_server(
            "claude_code:s1",
            "claude_code",
            "s1",
            "stdio",
            true,
            serde_json::json!({"command":"node","args":["a.js"],"env":{"API_KEY":"x"}}),
        )],
    );
    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"s1":{"command":"node","args":["a.js"],"env":{"API_KEY":"x"}}},"other":123}"#,
    );

    let p1 = server_preview_toggle(&paths, "claude_code:s1", false).unwrap();
    assert!(p1.summary.will_disable.contains(&"claude_code:s1".to_string()));
    let r1 = server_apply_toggle(&paths, "claude_code:s1", false, preconditions_from_preview(&p1)).unwrap();
    assert!(r1.summary.will_disable.contains(&"claude_code:s1".to_string()));
    let cfg_after_disable = fs::read_to_string(&paths.claude_config_path).unwrap();
    assert!(cfg_after_disable.contains("\"other\": 123"));
    assert!(!cfg_after_disable.contains("\"s1\""));

    let list1 = server_list(&paths, Some(Client::ClaudeCode)).unwrap();
    let s1 = list1.iter().find(|s| s.server_id == "claude_code:s1").unwrap();
    assert!(!s1.enabled);

    let p2 = server_preview_toggle(&paths, "claude_code:s1", true).unwrap();
    assert!(p2.summary.will_enable.contains(&"claude_code:s1".to_string()));
    let _r2 = server_apply_toggle(&paths, "claude_code:s1", true, preconditions_from_preview(&p2)).unwrap();
    let cfg_after_enable = fs::read_to_string(&paths.claude_config_path).unwrap();
    assert!(cfg_after_enable.contains("\"other\": 123"));
    assert!(cfg_after_enable.contains("\"s1\""));
    assert!(cfg_after_enable.contains("\"a.js\""));

    let list2 = server_list(&paths, Some(Client::ClaudeCode)).unwrap();
    let s1b = list2.iter().find(|s| s.server_id == "claude_code:s1").unwrap();
    assert!(s1b.enabled);
}

#[test]
fn codex_toggle_removes_and_restores_registry_server_in_external_file() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![registry_server(
            "codex:alpha",
            "codex",
            "alpha",
            "stdio",
            true,
            serde_json::json!({"command":"node","args":["server.js"],"enabled":true}),
        )],
    );
    write(
        &paths.codex_config_path,
        r#"
[mcp_servers.alpha]
command = "node"
args = ["server.js"]
enabled = true

[workspace]
name = "demo"
"#,
    );

    let p1 = server_preview_toggle(&paths, "codex:alpha", false).unwrap();
    assert!(p1.summary.will_disable.contains(&"codex:alpha".to_string()));
    server_apply_toggle(&paths, "codex:alpha", false, preconditions_from_preview(&p1)).unwrap();

    let s = fs::read_to_string(&paths.codex_config_path).unwrap();
    assert!(!s.contains("[mcp_servers.alpha]"));
    assert!(s.contains("[workspace]"));

    let list1 = server_list(&paths, Some(Client::Codex)).unwrap();
    let alpha = list1.iter().find(|server| server.server_id == "codex:alpha").unwrap();
    assert!(!alpha.enabled);

    let p2 = server_preview_toggle(&paths, "codex:alpha", true).unwrap();
    assert!(p2.summary.will_enable.contains(&"codex:alpha".to_string()));
    server_apply_toggle(&paths, "codex:alpha", true, preconditions_from_preview(&p2)).unwrap();

    let restored = fs::read_to_string(&paths.codex_config_path).unwrap();
    assert!(restored.contains("[mcp_servers.alpha]"));
    assert!(restored.contains("command = \"node\""));
    assert!(restored.contains("[workspace]"));
}

#[test]
fn precondition_failed_when_file_changes_after_preview() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![registry_server(
            "codex:alpha",
            "codex",
            "alpha",
            "stdio",
            true,
            serde_json::json!({"command":"node","enabled":true}),
        )],
    );
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
fn profile_apply_converges_claude_enabled_set_from_registry() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![
            registry_server(
                "claude_code:a",
                "claude_code",
                "a",
                "stdio",
                true,
                serde_json::json!({"command":"node","args":["a.js"]}),
            ),
            registry_server(
                "claude_code:b",
                "claude_code",
                "b",
                "stdio",
                true,
                serde_json::json!({"command":"node","args":["b.js"]}),
            ),
            registry_server(
                "claude_code:c",
                "claude_code",
                "c",
                "stdio",
                false,
                serde_json::json!({"command":"node","args":["c.js"]}),
            ),
        ],
    );
    write(
        &paths.claude_config_path,
        r#"{"mcpServers":{"a":{"command":"node"},"b":{"command":"node"}}}"#,
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

    let cfg = fs::read_to_string(&paths.claude_config_path).unwrap();
    assert!(!cfg.contains("\"a\""));
    assert!(cfg.contains("\"b\""));
    assert!(cfg.contains("\"c\""));
}

#[test]
fn apply_creates_backup_and_backup_list_filters() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![registry_server(
            "claude_code:s1",
            "claude_code",
            "s1",
            "stdio",
            true,
            serde_json::json!({"command":"node"}),
        )],
    );
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

    write_registry(
        &paths,
        vec![registry_server(
            "claude_code:s1",
            "claude_code",
            "s1",
            "stdio",
            true,
            serde_json::json!({"command":"node"}),
        )],
    );
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
    let codex_cfg = fs::read_to_string(&paths.codex_config_path).unwrap();
    assert!(codex_cfg.contains("[mcp_servers.alpha]"));
    assert!(paths.mcp_registry_path.exists());

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
    let claude_cfg = fs::read_to_string(&paths.claude_config_path).unwrap();
    assert!(claude_cfg.contains("\"s1\""));
    assert!(claude_cfg.contains("\"http://localhost:8080/mcp\""));
}

#[test]
fn server_get_edit_session_returns_editable_payload_for_claude() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.mcp_registry_path,
        r#"{
  "servers": [
    {
      "server_id": "claude_code:demo",
      "client": "claude_code",
      "name": "demo",
      "transport": "stdio",
      "enabled": true,
      "payload": {
        "command": "npx",
        "args": ["-y", "@demo/server"],
        "env": {"API_KEY": "secret"},
        "x_extra": "keep-me"
      },
      "source_origin": "claudecode.mcp.json",
      "updated_at": "2026-03-23T00:00:00Z"
    }
  ]
}"#,
    );

    let session = server_get_edit_session(&paths, "claude_code:demo").unwrap();
    assert_eq!(session.server_id, "claude_code:demo");
    assert!(session.unknown_fields.contains(&"x_extra".to_string()));
    assert_eq!(
        session
            .raw_fragment_json
            .get("command")
            .and_then(|value| value.as_str()),
        Some("npx")
    );
}

#[test]
fn server_get_reads_mcp_from_registry_even_without_external_config_files() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write(
        &paths.mcp_registry_path,
        r#"{
  "servers": [
    {
      "server_id": "codex:alpha",
      "client": "codex",
      "name": "alpha",
      "transport": "stdio",
      "enabled": true,
      "payload": {
        "command": "node",
        "args": ["alpha.js"]
      },
      "source_origin": "codex.mcp.json",
      "updated_at": "2026-03-23T00:00:00Z"
    }
  ]
}"#,
    );

    let got = server_get(&paths, "codex:alpha", false).unwrap();
    assert_eq!(got.server_id, "codex:alpha");
    assert_eq!(got.source_file, paths.mcp_registry_path.to_string_lossy().to_string());
}

#[test]
fn claude_edit_preview_and_apply_updates_only_target_server() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![
            registry_server(
                "claude_code:demo",
                "claude_code",
                "demo",
                "stdio",
                true,
                serde_json::json!({"command":"old","args":["a"],"x_extra":"keep"}),
            ),
            registry_server(
                "claude_code:other",
                "claude_code",
                "other",
                "stdio",
                true,
                serde_json::json!({"command":"stay"}),
            ),
        ],
    );
    write(
        &paths.claude_config_path,
        r#"{
  "theme": "dark",
  "mcpServers": {
    "demo": {
      "command": "old",
      "args": ["a"],
      "x_extra": "keep"
    },
    "other": {
      "command": "stay"
    }
  }
}"#,
    );

    let mut payload = serde_json::Map::new();
    payload.insert("command".into(), serde_json::json!("new"));
    payload.insert("args".into(), serde_json::json!(["b"]));
    payload.insert("x_extra".into(), serde_json::json!("keep"));

    let preview = server_preview_edit(&paths, "claude_code:demo", Transport::Stdio, payload.clone()).unwrap();
    assert!(preview.files[0].diff_unified.contains("\"command\": \"new\""));

    server_apply_edit(
        &paths,
        "claude_code:demo",
        Transport::Stdio,
        payload,
        preconditions_from_preview(&preview),
    )
    .unwrap();

    let cfg = fs::read_to_string(&paths.claude_config_path).unwrap();
    assert!(cfg.contains("\"theme\": \"dark\""));
    assert!(cfg.contains("\"command\": \"new\""));
    assert!(cfg.contains("\"other\""));
    assert!(cfg.contains("\"stay\""));

    let got = server_get(&paths, "claude_code:demo", false).unwrap();
    assert_eq!(
        got.payload.get("command").and_then(|value| value.as_str()),
        Some("new")
    );
}

#[test]
fn codex_edit_updates_registry_and_external_for_enabled_server() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![
            registry_server(
                "codex:alpha",
                "codex",
                "alpha",
                "stdio",
                true,
                serde_json::json!({"command":"old","args":["a"],"enabled":true}),
            ),
            registry_server(
                "codex:beta",
                "codex",
                "beta",
                "http",
                false,
                serde_json::json!({"url":"https://keep.example.com/mcp","enabled":false}),
            ),
        ],
    );
    write(
        &paths.codex_config_path,
        r#"
[mcp_servers.alpha]
command = "old"
args = ["a"]
enabled = true

[mcp_servers.beta]
url = "https://keep.example.com/mcp"
enabled = false
"#,
    );

    let mut payload = serde_json::Map::new();
    payload.insert("command".into(), serde_json::json!("new"));
    payload.insert("args".into(), serde_json::json!(["b"]));

    let preview = server_preview_edit(&paths, "codex:alpha", Transport::Stdio, payload.clone()).unwrap();
    server_apply_edit(
        &paths,
        "codex:alpha",
        Transport::Stdio,
        payload,
        preconditions_from_preview(&preview),
    )
    .unwrap();

    let cfg = fs::read_to_string(&paths.codex_config_path).unwrap();
    assert!(cfg.contains("command = \"new\""));
    assert!(!cfg.contains("[mcp_servers.beta]"));

    let got = server_get(&paths, "codex:alpha", false).unwrap();
    assert_eq!(
        got.payload.get("command").and_then(|value| value.as_str()),
        Some("new")
    );
}

#[test]
fn editing_disabled_codex_server_updates_registry_without_touching_external_file() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![registry_server(
            "codex:alpha",
            "codex",
            "alpha",
            "stdio",
            false,
            serde_json::json!({"command":"old","args":["a"],"enabled":false}),
        )],
    );
    write(&paths.codex_config_path, "[workspace]\nname = \"demo\"\n");

    let mut payload = serde_json::Map::new();
    payload.insert("command".into(), serde_json::json!("new"));
    payload.insert("args".into(), serde_json::json!(["b"]));

    let preview = server_preview_edit(&paths, "codex:alpha", Transport::Stdio, payload.clone()).unwrap();
    server_apply_edit(
        &paths,
        "codex:alpha",
        Transport::Stdio,
        payload,
        preconditions_from_preview(&preview),
    )
    .unwrap();

    let cfg = fs::read_to_string(&paths.codex_config_path).unwrap();
    assert_eq!(cfg, "[workspace]\nname = \"demo\"\n");

    let got = server_get(&paths, "codex:alpha", false).unwrap();
    assert!(!got.enabled);
    assert_eq!(
        got.payload.get("command").and_then(|value| value.as_str()),
        Some("new")
    );
}

#[test]
fn codex_edit_supports_nested_object_values_via_child_tables() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    write_registry(
        &paths,
        vec![registry_server(
            "codex:alpha",
            "codex",
            "alpha",
            "stdio",
            true,
            serde_json::json!({"command":"old","enabled":true}),
        )],
    );
    write(
        &paths.codex_config_path,
        r#"
[mcp_servers.alpha]
command = "old"
enabled = true
"#,
    );

    let mut payload = serde_json::Map::new();
    payload.insert("command".into(), serde_json::json!("new"));
    payload.insert("nested".into(), serde_json::json!({"bad": true}));

    let preview = server_preview_edit(&paths, "codex:alpha", Transport::Stdio, payload.clone()).unwrap();
    server_apply_edit(
        &paths,
        "codex:alpha",
        Transport::Stdio,
        payload,
        preconditions_from_preview(&preview),
    )
    .unwrap();

    let cfg = fs::read_to_string(&paths.codex_config_path).unwrap();
    assert!(cfg.contains("[mcp_servers.alpha.nested]"));
    assert!(cfg.contains("bad = true"));
}
