import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

export const NATIVE_LOCK_KEY = "wardrobe:native-shell";

/** Process-lifetime lock — survives React remounts; cleared only on full reload. */
let nativeLocked = false;

function readPersistedLock(): boolean {
  try {
    if (sessionStorage.getItem(NATIVE_LOCK_KEY) === "1") return true;
  } catch {
    /* private mode / blocked storage */
  }
  try {
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

function hasNativeQueryFlag(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("native") === "1";
  } catch {
    return false;
  }
}

function hasNativeHtmlClass(): boolean {
  try {
    return document.documentElement.classList.contains("native-app");
  } catch {
    return false;
  }
}

function hasCapacitorBridge(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* ignore */
  }
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
  return false;
}

function hasNativePath(): boolean {
  try {
    const p = window.location.pathname;
    return p === "/n" || p.startsWith("/n/");
  } catch {
    return false;
  }
}

function detectNative(): boolean {
  if (typeof window === "undefined") return false;
  if (hasNativePath()) return true;
  if (hasNativeQueryFlag()) return true;
  if (hasNativeHtmlClass()) return true;
  if (hasCapacitorBridge()) return true;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("WardrobeApp")) {
    return true;
  }
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
 * True inside the Capacitor iOS shell. Once true in this JS context / storage,
 * stays true so AppShell cannot flip to the website top-nav.
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
    try {
      document.documentElement.classList.add("native-app");
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

/** Call on app boot / after bridge ready to refresh detection. */
export function refreshNativeDetection(): boolean {
  if (detectNative() || readPersistedLock()) {
    nativeLocked = true;
    writePersistedLock();
    try {
      document.documentElement.classList.add("native-app");
    } catch {
      /* ignore */
    }
  }
  return isNativeApp();
}

/**
 * After locking, drop `?native=1` from the address bar so share links stay clean.
 * Keeps other params (e.g. outfit, view).
 */
export function stripNativeQueryFlag(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("native")) return;
    url.searchParams.delete("native");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", next || url.pathname);
  } catch {
    /* ignore */
  }
}

/** True if we must never navigate the WebView to an external shop URL. */
export function mustUseExternalBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isNativeApp() ||
    hasCapacitorBridge() ||
    hasNativeHtmlClass() ||
    readPersistedLock() ||
    (typeof navigator !== "undefined" && navigator.userAgent.includes("WardrobeApp"))
  );
}

/**
 * Open an http(s) URL outside the app WebView (Safari / SFSafariViewController).
 * Never use window.open inside Capacitor — it replaces the WebView with the shop.
 */
export async function openExternalUrl(raw: string): Promise<void> {
  let url: string;
  try {
    url = new URL(raw).toString();
  } catch {
    return;
  }
  if (!/^https?:\/\//i.test(url)) return;

  const forceExternal = mustUseExternalBrowser();
  // #region agent log
  try {
    const { agentLog } = await import("@/lib/agent-log");
    agentLog("C", "platform.ts:openExternalUrl", "opening external url", {
      forceExternal,
      isNative: isNativeApp(),
      hasCap: hasCapacitorBridge(),
      host: new URL(url).hostname,
    });
  } catch {
    /* ignore */
  }
  // #endregion

  if (forceExternal) {
    try {
      await Browser.open({ url });
      // #region agent log
      try {
        const { agentLog } = await import("@/lib/agent-log");
        agentLog("C", "platform.ts:Browser.open", "Browser.open ok", {
          host: new URL(url).hostname,
        });
      } catch {
        /* ignore */
      }
      // #endregion
      return;
    } catch (err) {
      // #region agent log
      try {
        const { agentLog } = await import("@/lib/agent-log");
        agentLog("C", "platform.ts:Browser.open", "Browser.open FAILED", {
          host: new URL(url).hostname,
          err: err instanceof Error ? err.message : String(err),
        });
      } catch {
        /* ignore */
      }
      // #endregion
      return;
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Patch window.open so any leftover callers cannot navigate the Capacitor WebView.
 * Call once on native boot.
 */
export function installNativeWindowOpenGuard(): void {
  if (typeof window === "undefined") return;
  if (!mustUseExternalBrowser()) return;
  const w = window as Window & { __wardrobeOpenPatched?: boolean };
  if (w.__wardrobeOpenPatched) return;
  w.__wardrobeOpenPatched = true;
  const original = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = typeof url === "string" ? url : url?.toString();
    if (href && /^https?:\/\//i.test(href)) {
      // #region agent log
      void import("@/lib/agent-log").then(({ agentLog }) => {
        agentLog("C", "platform.ts:window.open.guard", "intercepted window.open", {
          host: (() => {
            try {
              return new URL(href).hostname;
            } catch {
              return "";
            }
          })(),
        });
      });
      // #endregion
      void openExternalUrl(href);
      return null;
    }
    return original(url, target, features);
  }) as typeof window.open;
}

/**
 * Inline boot script for <head> — runs before React so html.native-app is set
 * on first paint and AppShell never hydrates into website chrome.
 */
export const NATIVE_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(NATIVE_LOCK_KEY)};var q=location.search.indexOf("native=1")!==-1;var ua=navigator.userAgent.indexOf("WardrobeApp")!==-1;var path=location.pathname==="/n"||location.pathname.indexOf("/n/")===0;var locked=false;try{locked=localStorage.getItem(k)==="1"||sessionStorage.getItem(k)==="1"}catch(e){}var cap=false;try{cap=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())}catch(e){}if(q||ua||locked||cap||path){document.documentElement.classList.add("native-app");try{localStorage.setItem(k,"1");sessionStorage.setItem(k,"1")}catch(e){}}}catch(e){}})();`;
