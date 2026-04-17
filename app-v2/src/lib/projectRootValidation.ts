const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH = /^\\\\[^\\]+\\[^\\]+/;

export function isAbsoluteProjectRoot(input: string): boolean {
  const value = input.trim();
  if (!value) return false;
  return WINDOWS_DRIVE_PATH.test(value) || WINDOWS_UNC_PATH.test(value) || value.startsWith("/");
}

export function getProjectRootDraftError(input: string): string | null {
  const value = input.trim();
  if (!value) return "请输入项目目录";
  if (!isAbsoluteProjectRoot(value)) {
    return "请输入绝对路径，例如 F:/myProjects/demo";
  }
  return null;
}
