/** Debug-mode client logger — posts to Cursor ingest + same-origin API. */
export function agentLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
) {
  const payload = {
    sessionId: "258aca",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId: "pre-fix",
  };

  // #region agent log
  try {
    fetch("http://127.0.0.1:7877/ingest/a3961505-d834-484f-bd0b-3cc9e69ef419", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "258aca",
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    fetch("http://10.0.0.33:7877/ingest/a3961505-d834-484f-bd0b-3cc9e69ef419", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "258aca",
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  // Same-origin — encode key fields in query so Vercel access logs show them
  try {
    const q = new URLSearchParams({
      h: hypothesisId,
      m: message.slice(0, 80),
      loc: location.slice(0, 60),
      d: JSON.stringify(data).slice(0, 300),
    });
    fetch(`/api/debug-log?${q.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  // #endregion
}
