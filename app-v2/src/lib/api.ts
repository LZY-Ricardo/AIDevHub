import type {
  ApplyResult,
  BackupRecord,
  Client,
  FilePrecondition,
  Profile,
  RuntimeInfo,
  ServerRecord,
  SkillGetResponse,
  SkillRecord,
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
    return invokeCmd("server_get", {
      serverId: payload.server_id,
      revealSecrets: payload.reveal_secrets,
    });
  },

  serverPreviewToggle(payload: { server_id: string; enabled: boolean }): Promise<WritePreview> {
    return invokeCmd("server_preview_toggle", { serverId: payload.server_id, enabled: payload.enabled });
  },

  serverApplyToggle(payload: {
    server_id: string;
    enabled: boolean;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("server_apply_toggle", {
      serverId: payload.server_id,
      enabled: payload.enabled,
      expectedFiles: payload.expected_files,
    });
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
    return invokeCmd("server_apply_add", {
      client: payload.client,
      name: payload.name,
      transport: payload.transport,
      config: payload.config,
      expectedFiles: payload.expected_files,
    });
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
    return invokeCmd("profile_update", {
      profileId: payload.profile_id,
      name: payload.name,
      targets: payload.targets,
    });
  },

  profileDelete(payload: { profile_id: string }): Promise<{ ok: true }> {
    return invokeCmd("profile_delete", { profileId: payload.profile_id });
  },

  profilePreviewApply(payload: { profile_id: string; client: Client }): Promise<WritePreview> {
    return invokeCmd("profile_preview_apply", { profileId: payload.profile_id, client: payload.client });
  },

  profileApply(payload: {
    profile_id: string;
    client: Client;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("profile_apply", {
      profileId: payload.profile_id,
      client: payload.client,
      expectedFiles: payload.expected_files,
    });
  },

  backupList(payload?: { target_path?: string }): Promise<BackupRecord[]> {
    return invokeCmd("backup_list", { targetPath: payload?.target_path });
  },

  backupPreviewRollback(payload: { backup_id: string }): Promise<WritePreview> {
    return invokeCmd("backup_preview_rollback", { backupId: payload.backup_id });
  },

  backupApplyRollback(payload: {
    backup_id: string;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("backup_apply_rollback", {
      backupId: payload.backup_id,
      expectedFiles: payload.expected_files,
    });
  },

  skillList(payload?: { client?: Client; scope?: "all" | "user" | "system" | "disabled" }): Promise<SkillRecord[]> {
    return invokeCmd("skill_list", {
      client: payload?.client,
      scope: payload?.scope,
    });
  },

  skillGet(payload: { skill_id: string }): Promise<SkillGetResponse> {
    return invokeCmd("skill_get", { skillId: payload.skill_id });
  },

  skillPreviewCreate(payload: { client: Client; name: string; description: string; body?: string }): Promise<WritePreview> {
    return invokeCmd("skill_preview_create", {
      client: payload.client,
      name: payload.name,
      description: payload.description,
      body: payload.body,
    });
  },

  skillApplyCreate(payload: {
    client: Client;
    name: string;
    description: string;
    body?: string;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("skill_apply_create", {
      client: payload.client,
      name: payload.name,
      description: payload.description,
      body: payload.body,
      expectedFiles: payload.expected_files,
    });
  },

  skillPreviewToggle(payload: { skill_id: string; enabled: boolean }): Promise<WritePreview> {
    return invokeCmd("skill_preview_toggle", { skillId: payload.skill_id, enabled: payload.enabled });
  },

  skillApplyToggle(payload: {
    skill_id: string;
    enabled: boolean;
    expected_files: FilePrecondition[];
  }): Promise<ApplyResult> {
    return invokeCmd("skill_apply_toggle", {
      skillId: payload.skill_id,
      enabled: payload.enabled,
      expectedFiles: payload.expected_files,
    });
  },
};
