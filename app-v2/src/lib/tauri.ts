import { invoke } from "@tauri-apps/api/core";
import type { AppError } from "./types";

export async function invokeCmd<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw normalizeInvokeError(err);
  }
}

function normalizeInvokeError(err: unknown): AppError {
  // Tauri rejects with whatever the backend returns; we normalize to AppError shape
  if (err && typeof err === "object") {
    const maybe = err as Partial<AppError>;
    if (typeof maybe.code === "string" && typeof maybe.message === "string") {
      return { code: maybe.code as AppError["code"], message: maybe.message, details: maybe.details };
    }
  }
  if (typeof err === "string") {
    return { code: "INTERNAL_ERROR", message: err };
  }
  return { code: "INTERNAL_ERROR", message: "Unknown error", details: err };
}

