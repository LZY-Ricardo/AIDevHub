export type Client = "claude_code" | "codex";
export type Transport = "stdio" | "http" | "unknown";
export type McpDiffCheckMode = "open_diff" | "summary_only";

export type SkillScope = "user" | "system";
export type SkillKind = "dir" | "file";

export interface AppSettings {
  mcp_diff_check_mode: McpDiffCheckMode;
}

export interface AppError {
  code:
    | "VALIDATION_ERROR"
    | "NOT_FOUND"
    | "PARSE_ERROR"
    | "IO_ERROR"
    | "PRECONDITION_FAILED"
    | "UNSUPPORTED"
    | "INTERNAL_ERROR";
  message: string;
  details?: unknown;
}

export interface Warning {
  code: "MISSING_SERVER" | "HIGH_RISK" | "ENV_VAR_MISSING" | "SKIPPED";
  message: string;
  details?: unknown;
}

export interface ServerRecord {
  server_id: string; // "<client>:<name>"
  name: string;
  client: Client;
  transport: Transport;
  enabled: boolean;
  source_file: string;
  identity: string;
  payload: Record<string, unknown>;
}

export interface ServerFieldMeta {
  known_fields: string[];
  secret_fields: string[];
  readonly_fields: string[];
  available_fields: string[];
}

export interface ServerEditSession {
  server_id: string;
  client: Client;
  transport: "stdio" | "http";
  source_file: string;
  editable_payload: Record<string, unknown>;
  raw_fragment_json: Record<string, unknown>;
  unknown_fields: string[];
  field_meta: ServerFieldMeta;
}

export interface ServerEditDraft {
  transport: "stdio" | "http";
  payload: Record<string, unknown>;
}

export interface ServerNotes {
  description: string;
  field_hints: Record<string, string>;
}

export interface Profile {
  profile_id: string;
  name: string;
  targets: {
    claude_code: string[];
    codex: string[];
  };
  updated_at: string;
}

export interface FilePrecondition {
  path: string;
  expected_before_sha256: string | null;
}

export interface FileChangePreview {
  path: string;
  will_create: boolean;
  before_sha256: string | null;
  after_sha256: string;
  diff_unified: string;
}

export interface MovePreview {
  from: string;
  to: string;
  kind: SkillKind;
}

export interface WriteSummary {
  will_enable: string[];
  will_disable: string[];
  will_add: string[];
}

export interface WritePreview {
  files: FileChangePreview[];
  moves?: MovePreview[];
  expected_files?: FilePrecondition[];
  summary: WriteSummary;
  warnings: Warning[];
}

export type BackupOp = "toggle" | "add_server" | "edit_server" | "apply_profile" | "rollback";

export interface BackupRecord {
  backup_id: string;
  target_path: string;
  backup_path: string;
  created_at: string;
  op: BackupOp;
  summary: string;
  affected_ids?: string[];
}

export interface ApplyResult {
  backups: BackupRecord[];
  summary: WriteSummary;
  warnings: Warning[];
}

export interface RuntimeInfo {
  paths: {
    claude_config_path: string;
    claude_commands_dir: string;
    claude_commands_disabled_dir: string;
    codex_config_path: string;
    codex_skills_dir: string;
    codex_skills_disabled_dir: string;
    app_local_data_dir: string;
    skill_store_root: string;
    skill_repo_root: string;
    skill_indexes_root: string;
    skill_index_path: string;
    profiles_path: string;
    disabled_pool_path: string;
    backups_dir: string;
    backup_index_path: string;
  };
  exists: {
    claude_config: boolean;
    codex_config: boolean;
  };
}

export interface SkillRecord {
  skill_id: string; // "<client>:<name>"
  client: Client;
  name: string;
  description: string;
  scope: SkillScope;
  kind: SkillKind;
  enabled: boolean;
  entry_path: string;
  container_path: string;
}

export interface SkillGetResponse {
  record: SkillRecord;
  content: string;
}

export type SkillSupportMode = "claude_only" | "codex_only" | "both";
export type SkillRepoSource = "imported_global" | "created_internal";
export type SkillSyncEventType = "imported" | "created" | "deployed" | "removed" | "drift_detected" | "synced_back";

export interface SkillSourceDetail {
  imported_from_client?: Client;
  imported_from_path?: string;
  imported_at?: string;
}

export interface SkillCatalogEntry {
  skill_id: string;
  slug: string;
  display_name: string;
  description: string;
  support_mode: SkillSupportMode;
  repo_root: string;
  files_root: string;
  entry_rel_path: string;
  source: SkillRepoSource;
  source_detail: SkillSourceDetail;
  content_hash: string;
  version: number;
  created_at: string;
  updated_at: string;
  archived: boolean;
}

export interface ManagedSkillView {
  skill_id: string;
  slug: string;
  display_name: string;
  description: string;
  support_mode: SkillSupportMode;
  version: number;
  updated_at: string;
}

export interface SkillManifest {
  skill_id: string;
  slug: string;
  display_name: string;
  description: string;
  support_mode: SkillSupportMode;
  repo_root: string;
  files_root: string;
  entry_rel_path: string;
  source: SkillRepoSource;
  source_detail: SkillSourceDetail;
  content_hash: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SkillRepoGetResponse {
  manifest: SkillManifest;
  content: string;
}

export type DeploymentTargetType = "claude_global" | "codex_global" | "claude_project" | "codex_project";
export type DeploymentStatus = "deployed" | "disabled" | "drifted" | "outdated";

export interface SkillDeployment {
  deployment_id: string;
  skill_id: string;
  target_type: DeploymentTargetType;
  client: Client;
  project_root?: string;
  target_root: string;
  target_skill_path: string;
  deployed_name: string;
  status: DeploymentStatus;
  source_hash: string;
  created_at: string;
  updated_at: string;
}

export interface SkillTargetProfile {
  target_profile_id: string;
  name: string;
  target_type: DeploymentTargetType;
  client: Client;
  project_root?: string;
  target_root: string;
  created_at: string;
  updated_at: string;
}

export interface SkillSyncEvent {
  event_id: string;
  skill_id: string;
  deployment_id?: string;
  event_type: SkillSyncEventType;
  message: string;
  created_at: string;
}

export type ConfigSourceKind = "mcp" | "skill";

export interface ConfigUpdateItem {
  source_id: string;
  client: Client;
  kind: ConfigSourceKind;
  current_sha256: string;
  diff_unified: string;
  requires_confirm_sync: boolean;
  confirm_sync_available?: boolean;
}

export interface ConfigCheckUpdatesResponse {
  updates: ConfigUpdateItem[];
}

export interface ConfigIgnoreCondition {
  source_id: string;
  current_sha256: string;
}

export interface ConfigIgnoreUpdatesResponse {
  ignored_source_ids: string[];
}

export interface ConfigConfirmMcpRequest {
  source_id: string;
  current_sha256: string;
  client: Client;
}

export interface ConfigConfirmMcpResponse {
  accepted: boolean;
  message: string;
}

export interface McpRegistryExternalDiff {
  client: Client;
  has_diff: boolean;
  target_path: string;
  diff_unified: string;
  before_fragment: string;
  after_fragment: string;
}

export type HealthStatus = "checking" | "ok" | "fail" | "timeout";

export interface HealthCheckResult {
  server_id: string;
  status: HealthStatus;
  latency_ms?: number;
  error?: string;
  checked_at: string;
}
