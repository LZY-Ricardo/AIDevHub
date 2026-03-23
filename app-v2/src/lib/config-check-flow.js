export function createRequestCoordinator() {
  let nextId = 0;
  let latestId = 0;
  let inFlight = 0;

  return {
    begin() {
      const requestId = ++nextId;
      latestId = requestId;
      inFlight += 1;
      return requestId;
    },
    isLatest(requestId) {
      return requestId === latestId;
    },
    end(_requestId) {
      inFlight = Math.max(0, inFlight - 1);
      return inFlight > 0;
    },
    getBusy() {
      return inFlight > 0;
    },
  };
}

export function toIgnoreConditions(updates) {
  return updates.map((item) => ({
    source_id: item.source_id,
    current_sha256: item.current_sha256,
  }));
}

export function buildConfirmMcpRequest(update) {
  if (!update) return null;
  if (update.kind !== "mcp") return null;
  if (!update.requires_confirm_sync) return null;
  if (!update.confirm_sync_available) return null;

  return {
    source_id: update.source_id,
    current_sha256: update.current_sha256,
    client: update.client,
  };
}
