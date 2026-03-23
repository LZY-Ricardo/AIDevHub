export async function confirmMcpUpdateWithRefresh({
  request,
  configBusy,
  setConfigBusy,
  setConfigError,
  acceptMcpUpdate,
  refreshConfigCheck,
  deriveStaleState,
  applyStaleState,
}) {
  if (configBusy) {
    return {
      accepted: false,
      message: "配置检查正在进行，请稍后重试。",
    };
  }

  setConfigBusy(true);
  setConfigError(null);

  try {
    let response;
    try {
      response = await acceptMcpUpdate(request);
    } catch (err) {
      setConfigError(err);
      return {
        accepted: false,
        message: err?.message ?? "确认 MCP 更新失败",
      };
    }

    try {
      await refreshConfigCheck({ propagateError: true });
    } catch (refreshErr) {
      setConfigError(refreshErr);
      const stale = deriveStaleState();
      applyStaleState(stale);
    }

    return response;
  } finally {
    setConfigBusy(false);
  }
}
