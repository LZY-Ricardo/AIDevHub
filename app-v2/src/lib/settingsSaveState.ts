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
      help: "等待设置加载完成后才能保存。",
    };
  }

  if (busy) {
    return {
      label: "保存中",
      help: "正在写回本地设置文件。",
    };
  }

  if (error) {
    return {
      label: "保存失败",
      help: "上一次保存未成功，请修复错误后重试。",
    };
  }

  const isDirty = currentMode !== settings.mcp_diff_check_mode;

  if (isDirty) {
    return {
      label: "未保存更改",
      help: "当前选择尚未写回本地设置文件。",
    };
  }

  return {
    label: "已同步",
    help: "当前页面状态已与本地设置文件一致。",
  };
}
