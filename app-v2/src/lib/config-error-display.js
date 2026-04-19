export const CONFIG_ERROR_AUTO_DISMISS_MS = 5000;

export function shouldAutoDismissConfigError(error) {
  return error?.code === "PRECONDITION_FAILED";
}

export function createConfigErrorAutoDismissUpdater(expectedError) {
  return (currentError) => (currentError === expectedError ? null : currentError);
}

export function scheduleConfigErrorAutoDismiss({
  error,
  onAutoDismiss,
  setTimeoutFn = window.setTimeout.bind(window),
  clearTimeoutFn = window.clearTimeout.bind(window),
}) {
  if (!shouldAutoDismissConfigError(error)) {
    return null;
  }

  const timer = setTimeoutFn(() => {
    onAutoDismiss();
  }, CONFIG_ERROR_AUTO_DISMISS_MS);

  return () => clearTimeoutFn(timer);
}

export function bindConfigErrorAutoDismiss({
  error,
  setConfigError,
  setTimeoutFn = window.setTimeout.bind(window),
  clearTimeoutFn = window.clearTimeout.bind(window),
}) {
  return scheduleConfigErrorAutoDismiss({
    error,
    onAutoDismiss: () => {
      setConfigError(createConfigErrorAutoDismissUpdater(error));
    },
    setTimeoutFn,
    clearTimeoutFn,
  });
}
