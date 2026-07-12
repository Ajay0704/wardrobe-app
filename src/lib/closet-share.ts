/** Shared types + helpers for Share Closet (Acloset-style ask-friends link). */

export type ClosetShareItem = {
  id: string;
  name: string;
  imageUrl: string;
  brand?: string;
  category: string;
};

export type ClosetSharePayload = {
  v: 1;
  id: string;
  q: string;
  items: ClosetShareItem[];
  from?: string;
};

export type ClosetShareReply = {
  id: string;
  author_name: string;
  message: string;
  suggested_item_ids: string[];
  created_at: string;
};

const MAX_ITEMS = 8;

export function snapshotShareItems(
  items: {
    id: string;
    name: string;
    imageUrl: string;
    brand?: string;
    category: string;
    wishlist?: boolean;
  }[],
  selectedIds: string[],
): ClosetShareItem[] {
  const set = new Set(selectedIds);
  return items
    .filter((it) => set.has(it.id) && !it.wishlist && it.imageUrl)
    .slice(0, MAX_ITEMS)
    .map((it) => ({
      id: it.id,
      name: it.name,
      imageUrl: it.imageUrl,
      brand: it.brand,
      category: it.category,
    }));
}

export function encodeClosetSharePayload(payload: ClosetSharePayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeClosetSharePayload(
  raw: string,
): ClosetSharePayload | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json) as ClosetSharePayload;
    if (data?.v !== 1 || !Array.isArray(data.items) || !data.q) return null;
    return data;
  } catch {
    return null;
  }
}

export { MAX_ITEMS as CLOSET_SHARE_MAX_ITEMS };
