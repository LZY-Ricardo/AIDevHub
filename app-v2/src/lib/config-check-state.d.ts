import type {
  AppError,
  ConfigUpdateItem,
} from "./types";

export interface ConfigCheckResultState {
  updates: ConfigUpdateItem[];
  dialogOpen: boolean;
  error: AppError | null;
}

export interface IgnorePreflightState {
  updates: ConfigUpdateItem[];
  dialogOpen: boolean;
}

export function deriveCheckResultState(
  updates: ConfigUpdateItem[],
  previousError: AppError | null,
): ConfigCheckResultState;
export function deriveIgnorePreflightState(): IgnorePreflightState;
export function shouldRefreshAfterIgnore(error: unknown): boolean;
