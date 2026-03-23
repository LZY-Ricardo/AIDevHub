import type {
  ConfigConfirmMcpRequest,
  ConfigIgnoreCondition,
  ConfigUpdateItem,
} from "./types";

export interface RequestCoordinator {
  begin(): number;
  isLatest(requestId: number): boolean;
  end(requestId: number): boolean;
  getBusy(): boolean;
}

export function createRequestCoordinator(): RequestCoordinator;
export function toIgnoreConditions(updates: ConfigUpdateItem[]): ConfigIgnoreCondition[];
export function buildConfirmMcpRequest(update: ConfigUpdateItem): ConfigConfirmMcpRequest | null;
