import type { AppError, AppSettings } from "./types";

export function deriveSettingsSaveState({
  settings,
  currentMode,
  busy,
  error,
}: {
  settings: AppSettings | null;
  currentMode: AppSettings["mcp_diff_check_mode"];
  busy: boolean;
  error: AppError | null;
}): {
  label: string;
  help: string;
} {
  if (!settings) {
    return {
      label: "未加载",
      help: "等待设置加载完成。",
    };
  }

  if (busy) {
    return {
      label: "保存中",
      help: "正在保存...",
    };
  }

  if (error) {
    return {
      label: "保存失败",
      help: "保存失败，请重试。",
    };
  }

  const isDirty = currentMode !== settings.mcp_diff_check_mode;

  if (isDirty) {
    return {
      label: "未保存更改",
      help: "有未保存的更改。",
    };
  }

  return {
    label: "已同步",
    help: "已与本地设置同步。",
  };
}
