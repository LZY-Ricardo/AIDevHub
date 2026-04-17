use std::process::Stdio;
use std::time::Instant;

use chrono::Utc;
use serde_json::{json, Map, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::mcp_registry::{self, McpRegistryServer};
use crate::model::{AppError, Client, HealthCheckResult, HealthStatus};
use crate::ops::AppPaths;

const STEP_TIMEOUT_SECS: u64 = 5;
const TOTAL_TIMEOUT_SECS: u64 = 15;
const MAX_CONCURRENT: usize = 5;

pub fn check_single(paths: &AppPaths, server_id: &str) -> Result<HealthCheckResult, AppError> {
    let server = mcp_registry::get_registry_server(paths, server_id)?
        .ok_or_else(|| AppError::new("NOT_FOUND", format!("server not found: {server_id}")))?;

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("tokio runtime: {e}")))?;
    Ok(rt.block_on(check_server(&server)))
}

pub fn check_all(paths: &AppPaths, client: Client) -> Result<Vec<HealthCheckResult>, AppError> {
    let servers = mcp_registry::list_registry_servers(paths, Some(client))?;
    let enabled: Vec<_> = servers.into_iter().filter(|s| s.enabled).collect();

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("tokio runtime: {e}")))?;

    rt.block_on(async {
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT));
        let mut handles = Vec::new();

        for server in enabled {
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            handles.push(tokio::spawn(async move {
                let result = check_server(&server).await;
                drop(permit);
                result
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(result) => results.push(result),
                Err(e) => results.push(HealthCheckResult {
                    server_id: String::new(),
                    status: HealthStatus::Fail,
                    latency_ms: None,
                    error: Some(format!("task join error: {e}")),
                    checked_at: now_iso(),
                }),
            }
        }
        Ok(results)
    })
}

async fn check_server(server: &McpRegistryServer) -> HealthCheckResult {
    let start = Instant::now();
    let checked_at = now_iso();

    let result = match server.transport {
        crate::model::Transport::Stdio => check_stdio(&server.payload).await,
        crate::model::Transport::Http => check_http(&server.payload).await,
        crate::model::Transport::Unknown => Err("unknown transport type".to_string()),
    };

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(()) => HealthCheckResult {
            server_id: server.server_id.clone(),
            status: HealthStatus::Ok,
            latency_ms: Some(latency_ms),
            error: None,
            checked_at,
        },
        Err(msg) => HealthCheckResult {
            server_id: server.server_id.clone(),
            status: if msg.contains("timeout") || msg.contains("Timeout") {
                HealthStatus::Timeout
            } else {
                HealthStatus::Fail
            },
            latency_ms: Some(latency_ms),
            error: Some(msg),
            checked_at,
        },
    }
}

async fn check_stdio(payload: &Map<String, Value>) -> Result<(), String> {
    let command = payload
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing 'command' field".to_string())?
        .to_string();

    let args: Vec<String> = payload
        .get("args")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut envs = Vec::new();
    if let Some(env_obj) = payload.get("env").and_then(Value::as_object) {
        for (k, v) in env_obj {
            if let Some(val) = v.as_str() {
                envs.push((k.clone(), val.to_string()));
            }
        }
    }

    let total = Duration::from_secs(TOTAL_TIMEOUT_SECS);
    timeout(total, async {
        let mut cmd = Command::new(&command);
        cmd.args(&args)
            .envs(envs)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;

        let stdin = child.stdin.as_mut().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let mut reader = BufReader::new(stdout).lines();

        // Step 1: initialize
        let init_req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "aidevhub", "version": "1.0.0" }
            }
        });
        send_json_rpc(stdin, &init_req).await?;

        let init_resp = timeout(
            Duration::from_secs(STEP_TIMEOUT_SECS),
            read_response(&mut reader),
        )
        .await
        .map_err(|_| "initialize timeout (5s)".to_string())?
        .map_err(|e| format!("initialize read error: {e}"))?;

        if init_resp.get("error").is_some() {
            let msg = init_resp["error"]["message"].as_str().unwrap_or("unknown");
            return Err(format!("initialize error: {msg}"));
        }

        // Step 2: initialized notification
        let notif = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        send_json_rpc(stdin, &notif).await?;

        // Step 3: ping
        let ping_req = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "ping"
        });
        send_json_rpc(stdin, &ping_req).await?;

        let ping_resp = timeout(
            Duration::from_secs(STEP_TIMEOUT_SECS),
            read_response(&mut reader),
        )
        .await
        .map_err(|_| "ping timeout (5s)".to_string())?
        .map_err(|e| format!("ping read error: {e}"))?;

        if ping_resp.get("error").is_some() {
            let msg = ping_resp["error"]["message"].as_str().unwrap_or("unknown");
            return Err(format!("ping error: {msg}"));
        }

        // Cleanup
        let _ = child.kill().await;
        let _ = child.wait().await;
        Ok(())
    })
    .await
    .map_err(|_| "total timeout (15s)".to_string())?
}

async fn check_http(payload: &Map<String, Value>) -> Result<(), String> {
    let url = payload
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing 'url' field".to_string())?
        .to_string();

    let total = Duration::from_secs(TOTAL_TIMEOUT_SECS);
    timeout(total, async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(STEP_TIMEOUT_SECS))
            .build()
            .map_err(|e| format!("http client error: {e}"))?;

        // Step 1: initialize
        let init_req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "aidevhub", "version": "1.0.0" }
            }
        });

        let resp = client
            .post(&url)
            .json(&init_req)
            .send()
            .await
            .map_err(|e| format!("initialize request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("initialize HTTP {}", resp.status()));
        }

        let init_resp: Value = resp
            .json()
            .await
            .map_err(|e| format!("initialize response parse error: {e}"))?;

        if init_resp.get("error").is_some() {
            let msg = init_resp["error"]["message"].as_str().unwrap_or("unknown");
            return Err(format!("initialize error: {msg}"));
        }

        // Step 2: ping
        let ping_req = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "ping"
        });

        let resp = client
            .post(&url)
            .json(&ping_req)
            .send()
            .await
            .map_err(|e| format!("ping request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("ping HTTP {}", resp.status()));
        }

        let ping_resp: Value = resp
            .json()
            .await
            .map_err(|e| format!("ping response parse error: {e}"))?;

        if ping_resp.get("error").is_some() {
            let msg = ping_resp["error"]["message"].as_str().unwrap_or("unknown");
            return Err(format!("ping error: {msg}"));
        }

        Ok(())
    })
    .await
    .map_err(|_| "total timeout (15s)".to_string())?
}

async fn send_json_rpc(stdin: &mut tokio::process::ChildStdin, msg: &Value) -> Result<(), String> {
    let mut line = serde_json::to_string(msg).map_err(|e| format!("serialize error: {e}"))?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| format!("stdin write error: {e}"))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("stdin flush error: {e}"))?;
    Ok(())
}

async fn read_response(
    reader: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
) -> Result<Value, String> {
    while let Some(line) = reader
        .next_line()
        .await
        .map_err(|e| format!("stdout read error: {e}"))?
    {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
            if val.get("id").is_some() || val.get("error").is_some() {
                return Ok(val);
            }
        }
    }
    Err("stdout closed before receiving response".to_string())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
