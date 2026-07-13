"use client";

import { Shirt } from "lucide-react";
import { useState } from "react";
import type { ChatKind, ChatPayload } from "@/lib/chat";

function Img({ src }: { src?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-2">
        <Shirt size={20} className="text-muted" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setErr(true)} className="h-full w-full object-cover" />
  );
}

const LABEL: Partial<Record<ChatKind, string>> = {
  outfit: "Outfit",
  item: "Item",
  look: "Look",
};

/** Renders a shared message's payload: a photo, or an outfit/item/look card built
 *  from the self-contained snapshot pieces. */
export function ShareCard({ kind, payload }: { kind: ChatKind; payload?: ChatPayload | null }) {
  if (kind === "image") {
    return (
      <div className="overflow-hidden rounded-xl bg-surface-2">
        <Img src={payload?.imageUrl} />
      </div>
    );
  }
  const pieces = (payload?.pieces ?? []).slice(0, 4);
  const single = pieces.length <= 1;
  return (
    <div className="w-48 overflow-hidden rounded-xl border border-line bg-surface">
      {single ? (
        <div className="aspect-square bg-surface-2">
          <Img src={pieces[0]?.imageUrl} />
        </div>
      ) : (
        <div className="grid aspect-square grid-cols-2 gap-px bg-line">
          {pieces.map((p, i) => (
            <div key={p.id ?? i} className="overflow-hidden bg-surface-2">
              <Img src={p.imageUrl} />
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - pieces.length) }).map((_, i) => (
            <div key={`e${i}`} className="bg-surface-2" />
          ))}
        </div>
      )}
      <div className="px-2.5 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted">{LABEL[kind] ?? "Shared"}</p>
        <p className="truncate text-sm font-medium text-foreground">{payload?.title || "Shared"}</p>
      </div>
    </div>
  );
}
