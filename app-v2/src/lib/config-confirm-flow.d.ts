import type { AppError, ConfigConfirmMcpRequest, ConfigConfirmMcpResponse } from "./types";

export interface ConfirmFlowStaleState {
  updates: unknown[];
  dialogOpen: boolean;
}

export interface ConfirmMcpUpdateFlowArgs {
  request: ConfigConfirmMcpRequest;
  configBusy: boolean;
  setConfigBusy: (busy: boolean) => void;
  setConfigError: (error: AppError | null) => void;
  acceptMcpUpdate: (request: ConfigConfirmMcpRequest) => Promise<ConfigConfirmMcpResponse>;
  refreshConfigCheck: (options?: { propagateError?: boolean }) => Promise<void>;
  deriveStaleState: () => ConfirmFlowStaleState;
  applyStaleState: (state: ConfirmFlowStaleState) => void;
}

export function confirmMcpUpdateWithRefresh(
  args: ConfirmMcpUpdateFlowArgs,
): Promise<ConfigConfirmMcpResponse>;
