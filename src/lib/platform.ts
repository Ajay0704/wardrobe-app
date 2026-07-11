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

function detectNative(): boolean {
  if (typeof window === "undefined") return false;

  // Hard lock from Capacitor server.url (?native=1) — most reliable signal.
  if (hasNativeQueryFlag()) return true;
  if (hasNativeHtmlClass()) return true;

  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* bridge not ready */
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

/**
 * Inline boot script for <head> — runs before React so html.native-app is set
 * on first paint and AppShell never hydrates into website chrome.
 */
export const NATIVE_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(NATIVE_LOCK_KEY)};var q=location.search.indexOf("native=1")!==-1;var ua=navigator.userAgent.indexOf("WardrobeApp")!==-1;var locked=false;try{locked=localStorage.getItem(k)==="1"||sessionStorage.getItem(k)==="1"}catch(e){}var cap=false;try{cap=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())}catch(e){}if(q||ua||locked||cap){document.documentElement.classList.add("native-app");try{localStorage.setItem(k,"1");sessionStorage.setItem(k,"1")}catch(e){}}}catch(e){}})();`;
