/**
 * Client helpers for web-push subscription (Phase 1.3).
 * Requires NEXT_PUBLIC_VAPID_PUBLIC_KEY and a signed-in Supabase session.
 */

import { getSupabase } from "./supabase/client";

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker.register("/sw.js");
}

export async function subscribeToPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushConfigured()) {
    return {
      ok: false,
      error: "Push is not configured yet (missing NEXT_PUBLIC_VAPID_PUBLIC_KEY).",
    };
  }
  if (!("Notification" in window) || !("PushManager" in window)) {
    return { ok: false, error: "This browser does not support push notifications." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission was denied." };
  }

  const reg = await ensureServiceWorker();
  if (!reg) return { ok: false, error: "Could not register the service worker." };

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Sign in to sync push subscriptions." };

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "Sign in to enable morning outfit nudges." };

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(sub.toJSON()),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error || `Subscribe failed (${res.status})` };
  }
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  const supabase = getSupabase();
  const { data: session } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = session.session?.access_token;
  if (token) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
  }
  await sub.unsubscribe();
}
