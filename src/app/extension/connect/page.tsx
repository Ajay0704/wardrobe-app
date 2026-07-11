"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthProvider } from "@/components/AuthProvider";
import { Button } from "@/components/ui";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { useWardrobe } from "@/lib/store";

/**
 * Bridge page for the Chrome/Edge wishlist clipper.
 * Opened as: /extension/connect?ext=<chrome.runtime.id>
 * Sends the current Supabase access token to the extension via
 * chrome.runtime.sendMessage (externally_connectable).
 */
function ConnectInner() {
  const { authUser, authChecked } = useWardrobe();
  const [extId, setExtId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("ext") || "";
    setExtId(q.trim());
  }, []);

  const connect = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (!extId) {
        setStatus("Open this page from the extension (Connect account).");
        return;
      }
      const supabase = getSupabase();
      if (!supabase) {
        setStatus("Supabase is not configured.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const email = data.session?.user?.email;
      if (!token) {
        setStatus("Sign in first, then tap Connect again.");
        return;
      }

      const chromeApi = (
        window as unknown as {
          chrome?: {
            runtime?: {
              sendMessage: (
                id: string,
                msg: unknown,
                cb: (res: unknown) => void,
              ) => void;
              lastError?: { message?: string };
            };
          };
        }
      ).chrome;

      if (!chromeApi?.runtime?.sendMessage) {
        setStatus("Open this page in Chrome/Edge with the extension installed.");
        return;
      }

      await new Promise<void>((resolve) => {
        chromeApi.runtime!.sendMessage(
          extId,
          {
            type: "WARDROBE_AUTH",
            accessToken: token,
            email: email || "",
            expiresAt: data.session?.expires_at ?? null,
          },
          (res) => {
            const err = chromeApi.runtime!.lastError;
            if (err) {
              setStatus(err.message || "Extension did not respond.");
            } else if (
              res &&
              typeof res === "object" &&
              (res as { ok?: boolean }).ok
            ) {
              setStatus("Connected — you can close this tab and save products.");
            } else {
              setStatus("Extension responded but did not confirm.");
            }
            resolve();
          },
        );
      });
    } finally {
      setBusy(false);
    }
  };

  if (!authChecked && isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center p-6">
        <p className="text-sm text-muted">Checking sign-in…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="heading text-2xl">Connect wishlist clipper</h1>
      <p className="text-sm text-muted">
        Link the browser extension so Save to Wardrobe can add shop pages to
        your wishlist while you&apos;re signed in.
      </p>
      {!authUser ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          Sign in to Wardrobe first, then return here.{" "}
          <Link className="underline" href="/?auth=login">
            Log in
          </Link>
        </p>
      ) : (
        <p className="text-sm text-foreground">
          Signed in as <strong>{authUser.email}</strong>
        </p>
      )}
      {!extId && (
        <p className="text-xs text-muted">
          Tip: use <strong>Connect account</strong> in the extension popup so
          this page gets the extension id automatically.
        </p>
      )}
      <Button disabled={busy || !authUser} onClick={() => void connect()}>
        {busy ? "Connecting…" : "Connect extension"}
      </Button>
      {status && <p className="text-sm text-muted">{status}</p>}
    </main>
  );
}

export default function ExtensionConnectPage() {
  return (
    <AuthProvider>
      <ConnectInner />
    </AuthProvider>
  );
}
