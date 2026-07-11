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
  // LAN (iPhone → Mac) — may be blocked by ATS/mixed content on https pages
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
  // Same-origin — works from Capacitor production WebView
  try {
    fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  // #endregion
}
