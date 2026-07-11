import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

const NATIVE_LOCK_KEY = "wardrobe:native-shell";

/** Process-lifetime lock — survives React remounts; cleared only on full reload. */
let nativeLocked = false;

function readPersistedLock(): boolean {
  try {
    if (sessionStorage.getItem(NATIVE_LOCK_KEY) === "1") return true;
  } catch {
    /* private mode / blocked storage */
  }
  try {
    // localStorage survives some WebView session clears better than sessionStorage.
    if (localStorage.getItem(NATIVE_LOCK_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function writePersistedLock(): void {
  try {
    sessionStorage.setItem(NATIVE_LOCK_KEY, "1");
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(NATIVE_LOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}

function detectNative(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* bridge not ready */
  }

  // Capacitor global (injected into the WebView even with server.url)
  try {
    const cap = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
      }
    ).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    const platform = cap?.getPlatform?.();
    if (platform === "ios" || platform === "android") return true;
  } catch {
    /* ignore */
  }

  if (typeof navigator !== "undefined" && navigator.userAgent.includes("WardrobeApp")) {
    return true;
  }

  // Capacitor often injects this protocol handler / iframe bridge marker.
  try {
    if (
      (window as unknown as { webkit?: { messageHandlers?: { bridge?: unknown } } }).webkit
        ?.messageHandlers?.bridge
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}

/**
 * True inside the Capacitor iOS shell. Once true in this JS context, stays true
 * so AppShell cannot flip to the website top-nav after opening an item.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  if (nativeLocked || readPersistedLock()) {
    nativeLocked = true;
    return true;
  }
  if (detectNative()) {
    nativeLocked = true;
    writePersistedLock();
    return true;
  }
  return false;
}

/** Call on app boot / after bridge ready to refresh detection. */
export function refreshNativeDetection(): boolean {
  if (detectNative()) {
    nativeLocked = true;
    writePersistedLock();
  }
  return isNativeApp();
}

/**
 * Open an http(s) URL outside the app WebView (Safari).
 * Never use target=_blank inside Capacitor — it can replace the WebView.
 */
export async function openExternalUrl(raw: string): Promise<void> {
  let url: string;
  try {
    url = new URL(raw).toString();
  } catch {
    return;
  }
  if (!/^https?:\/\//i.test(url)) return;

  if (isNativeApp()) {
    try {
      await Browser.open({ url });
      return;
    } catch {
      // Last resort — still avoid location.assign which replaces the WebView.
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
      return;
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export { NATIVE_LOCK_KEY };
