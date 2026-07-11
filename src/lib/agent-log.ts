/** Debug-mode client logger — same-origin API with query fields visible in Vercel. */
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
    runId: "post-fix",
  };

  // #region agent log
  const q = new URLSearchParams({
    h: hypothesisId,
    m: message.slice(0, 60),
    loc: location.slice(0, 40),
    d: JSON.stringify(data).slice(0, 180),
  });
  const path = `/api/debug-log?${q.toString()}`;

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

  // Prefer sendBeacon so logs flush even if WebView is about to navigate away
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(path, blob);
    }
  } catch {
    /* ignore */
  }

  try {
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  // #endregion
}
