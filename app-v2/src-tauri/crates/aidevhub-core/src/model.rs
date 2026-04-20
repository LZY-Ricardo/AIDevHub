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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillSupportMode {
    ClaudeOnly,
    CodexOnly,
    Both,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillRepoSource {
    ImportedGlobal,
    CreatedInternal,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SkillSourceDetail {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imported_from_client: Option<Client>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imported_from_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imported_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillCatalogEntry {
    pub skill_id: String,
    pub slug: String,
    pub display_name: String,
    pub description: String,
    pub support_mode: SkillSupportMode,
    pub repo_root: String,
    pub files_root: String,
    pub entry_rel_path: String,
    pub source: SkillRepoSource,
    #[serde(default)]
    pub source_detail: SkillSourceDetail,
    pub content_hash: String,
    pub version: u32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillManifest {
    pub skill_id: String,
    pub slug: String,
    pub display_name: String,
    pub description: String,
    pub support_mode: SkillSupportMode,
    pub repo_root: String,
    pub files_root: String,
    pub entry_rel_path: String,
    pub source: SkillRepoSource,
    #[serde(default)]
    pub source_detail: SkillSourceDetail,
    pub content_hash: String,
    pub version: u32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedSkillView {
    pub skill_id: String,
    pub slug: String,
    pub display_name: String,
    pub description: String,
    pub support_mode: SkillSupportMode,
    pub version: u32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillRepoGetResponse {
    pub manifest: SkillManifest,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentTargetType {
    ClaudeGlobal,
    CodexGlobal,
    ClaudeProject,
    CodexProject,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentStatus {
    Deployed,
    Disabled,
    Drifted,
    Outdated,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDeployment {
    pub deployment_id: String,
    pub skill_id: String,
    pub target_type: DeploymentTargetType,
    pub client: Client,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_root: Option<String>,
    pub target_root: String,
    pub target_skill_path: String,
    pub deployed_name: String,
    pub status: DeploymentStatus,
    pub source_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillTargetProfile {
    pub target_profile_id: String,
    pub name: String,
    pub target_type: DeploymentTargetType,
    pub client: Client,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_root: Option<String>,
    pub target_root: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillSyncEventType {
    Imported,
    Created,
    Deployed,
    Removed,
    DriftDetected,
    SyncedBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSyncEvent {
    pub event_id: String,
    pub skill_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deployment_id: Option<String>,
    pub event_type: SkillSyncEventType,
    pub message: String,
    pub created_at: String,
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
    ToggleSkill,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub affected_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub enabled_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub disabled_ids: Vec<String>,
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
    pub claude_skills_dir: String,
    pub claude_skills_disabled_dir: String,
    pub codex_config_path: String,
    pub codex_skills_dir: String,
    pub codex_skills_disabled_dir: String,
    pub app_local_data_dir: String,
    pub profiles_path: String,
    pub disabled_pool_path: String,
    pub backups_dir: String,
    pub backup_index_path: String,
    pub skill_store_root: String,
    pub skill_repo_root: String,
    pub skill_indexes_root: String,
    pub skill_index_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeExists {
    pub claude_config: bool,
    pub codex_config: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigSourceKind {
    Mcp,
    Skill,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigUpdateItem {
    pub source_id: String,
    pub client: Client,
    pub kind: ConfigSourceKind,
    pub current_sha256: String,
    pub diff_unified: String,
    pub requires_confirm_sync: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirm_sync_available: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConfigCheckUpdatesResponse {
    #[serde(default)]
    pub updates: Vec<ConfigUpdateItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConfigIgnoreUpdatesResponse {
    #[serde(default)]
    pub ignored_source_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigIgnoreCondition {
    pub source_id: String,
    pub current_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigAcceptMcpResponse {
    pub accepted: bool,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum McpDiffCheckMode {
    OpenDiff,
    SummaryOnly,
}

impl Default for McpDiffCheckMode {
    fn default() -> Self {
        Self::OpenDiff
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub mcp_diff_check_mode: McpDiffCheckMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRegistryExternalDiff {
    pub client: Client,
    pub target_path: String,
    pub has_diff: bool,
    pub diff_unified: String,
    pub before_fragment: String,
    pub after_fragment: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Checking,
    Ok,
    Fail,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckResult {
    pub server_id: String,
    pub status: HealthStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub checked_at: String,
}
