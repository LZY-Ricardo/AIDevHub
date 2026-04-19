import type { AppError } from "./types";

export const CONFIG_ERROR_AUTO_DISMISS_MS: number;
export function shouldAutoDismissConfigError(error: AppError | null | undefined): boolean;
export function createConfigErrorAutoDismissUpdater(
  expectedError: AppError,
): (currentError: AppError | null) => AppError | null;
export function scheduleConfigErrorAutoDismiss<TimerHandle = number>(args: {
  error: AppError | null | undefined;
  onAutoDismiss: () => void;
  setTimeoutFn?: (callback: () => void, delay: number) => TimerHandle;
  clearTimeoutFn?: (timer: TimerHandle) => void;
}): (() => void) | null;
export function bindConfigErrorAutoDismiss<TimerHandle = number>(args: {
  error: AppError | null | undefined;
  setConfigError: (updater: (currentError: AppError | null) => AppError | null) => void;
  setTimeoutFn?: (callback: () => void, delay: number) => TimerHandle;
  clearTimeoutFn?: (timer: TimerHandle) => void;
}): (() => void) | null;
