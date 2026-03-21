export type Client = "claude_code" | "codex";
export type Transport = "stdio" | "http" | "unknown";

export type SkillScope = "user" | "system";
export type SkillKind = "dir" | "file";

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

export type BackupOp = "toggle" | "add_server" | "apply_profile" | "rollback";

export interface BackupRecord {
  backup_id: string;
  target_path: string;
  backup_path: string;
  created_at: string;
  op: BackupOp;
  summary: string;
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
