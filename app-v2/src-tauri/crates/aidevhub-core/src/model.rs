use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Client {
    ClaudeCode,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Transport {
    Stdio,
    Http,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillScope {
    User,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillKind {
    Dir,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warning {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerRecord {
    pub server_id: String, // "<client>:<name>"
    pub name: String,
    pub client: Client,
    pub transport: Transport,
    pub enabled: bool,
    pub source_file: String,
    pub identity: String,
    pub payload: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerFieldMeta {
    pub known_fields: Vec<String>,
    pub secret_fields: Vec<String>,
    pub readonly_fields: Vec<String>,
    pub available_fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEditSession {
    pub server_id: String,
    pub client: Client,
    pub transport: Transport,
    pub source_file: String,
    pub editable_payload: serde_json::Map<String, serde_json::Value>,
    pub raw_fragment_json: serde_json::Map<String, serde_json::Value>,
    pub unknown_fields: Vec<String>,
    pub field_meta: ServerFieldMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEditDraft {
    pub transport: Transport,
    pub payload: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerNotes {
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub field_hints: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillRecord {
    pub skill_id: String, // "<client>:<name>"
    pub client: Client,
    pub name: String,
    pub description: String,
    pub scope: SkillScope,
    pub kind: SkillKind,
    pub enabled: bool,
    pub entry_path: String,
    pub container_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillGetResponse {
    pub record: SkillRecord,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub profile_id: String,
    pub name: String,
    pub targets: ProfileTargets,
    pub updated_at: String, // ISO8601
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileTargets {
    pub claude_code: Vec<String>,
    pub codex: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePrecondition {
    pub path: String,
    pub expected_before_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangePreview {
    pub path: String,
    pub will_create: bool,
    pub before_sha256: Option<String>,
    pub after_sha256: String,
    pub diff_unified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovePreview {
    pub from: String,
    pub to: String,
    pub kind: SkillKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WriteSummary {
    pub will_enable: Vec<String>,
    pub will_disable: Vec<String>,
    pub will_add: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritePreview {
    pub files: Vec<FileChangePreview>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub moves: Vec<MovePreview>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub expected_files: Vec<FilePrecondition>,
    pub summary: WriteSummary,
    pub warnings: Vec<Warning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupOp {
    Toggle,
    AddServer,
    EditServer,
    ApplyProfile,
    Rollback,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    pub backup_id: String,
    pub target_path: String,
    pub backup_path: String,
    pub created_at: String,
    pub op: BackupOp,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyResult {
    pub backups: Vec<BackupRecord>,
    pub summary: WriteSummary,
    pub warnings: Vec<Warning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeGetInfoResponse {
    pub paths: RuntimePaths,
    pub exists: RuntimeExists,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimePaths {
    pub claude_config_path: String,
    pub claude_commands_dir: String,
    pub claude_commands_disabled_dir: String,
    pub codex_config_path: String,
    pub codex_skills_dir: String,
    pub codex_skills_disabled_dir: String,
    pub app_local_data_dir: String,
    pub profiles_path: String,
    pub disabled_pool_path: String,
    pub backups_dir: String,
    pub backup_index_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeExists {
    pub claude_config: bool,
    pub codex_config: bool,
}
