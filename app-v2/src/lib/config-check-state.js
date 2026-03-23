export function deriveCheckResultState(updates, _previousError) {
  return {
    updates,
    dialogOpen: updates.length > 0,
    error: null,
  };
}

export function deriveIgnorePreflightState() {
  return {
    updates: [],
    dialogOpen: false,
  };
}

export function shouldRefreshAfterIgnore(_error) {
  return true;
}
