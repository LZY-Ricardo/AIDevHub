import type {
  ApplyResult,
  BackupRecord,
  Client,
  FilePrecondition,
  Profile,
  RuntimeInfo,
  ServerRecord,
  WritePreview,
} from "./types";
import { invokeCmd } from "./tauri";

export const api = {
  runtimeGetInfo(): Promise<RuntimeInfo> {
    return invokeCmd("runtime_get_info");
  },

  serverList(payload?: { client?: Client }): Promise<ServerRecord[]> {
    return invokeCmd("server_list", payload ?? {});
  },

  serverGet(payload: { server_id: string; reveal_secrets?: boolean }): Promise<ServerRecord> {
    return invokeCmd("server_get", payload);
  },

  serverPreviewToggle(payload: { server_id: string; enabled: boolean }): Promise<WritePreview> {
    return invokeCmd("server_preview_toggle", payload);
  },

  serverApplyToggle(payload: {
    server_id: string;
    enabled: boolean;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("server_apply_toggle", payload);
  },

  serverPreviewAdd(payload: {
    client: Client;
    name: string;
    transport: "stdio" | "http";
    config: Record<string, unknown>;
  }): Promise<WritePreview> {
    return invokeCmd("server_preview_add", payload);
  },

  serverApplyAdd(payload: {
    client: Client;
    name: string;
    transport: "stdio" | "http";
    config: Record<string, unknown>;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("server_apply_add", payload);
  },

  profileList(): Promise<Profile[]> {
    return invokeCmd("profile_list");
  },

  profileCreate(payload: { name: string; targets: Profile["targets"] }): Promise<Profile> {
    return invokeCmd("profile_create", payload);
  },

  profileUpdate(payload: {
    profile_id: string;
    name?: string;
    targets?: Profile["targets"];
  }): Promise<Profile> {
    return invokeCmd("profile_update", payload);
  },

  profileDelete(payload: { profile_id: string }): Promise<{ ok: true }> {
    return invokeCmd("profile_delete", payload);
  },

  profilePreviewApply(payload: { profile_id: string; client: Client }): Promise<WritePreview> {
    return invokeCmd("profile_preview_apply", payload);
  },

  profileApply(payload: {
    profile_id: string;
    client: Client;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("profile_apply", payload);
  },

  backupList(payload?: { target_path?: string }): Promise<BackupRecord[]> {
    return invokeCmd("backup_list", payload ?? {});
  },

  backupPreviewRollback(payload: { backup_id: string }): Promise<WritePreview> {
    return invokeCmd("backup_preview_rollback", payload);
  },

  backupApplyRollback(payload: {
    backup_id: string;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("backup_apply_rollback", payload);
  },
};

