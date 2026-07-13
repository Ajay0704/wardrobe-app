// Seed shop_products (AJA-97) from the existing Explore `products` catalog:
// map each row to the spec schema and embed its image, so /api/similar +
// /api/goes-with have data. Run AFTER the 20260717 migration is applied:
//   node scripts/seed-shop.mjs [limit]
// Embeddings use HF SigLIP when HF_TOKEN is set, else a deterministic stub
// (feeds still group correctly by category/compat; visual order is placeholder).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const LIMIT = Number(process.argv[2]) || 250;
const DIM = 768;
const HF_MODEL = env.HF_EMBED_MODEL || "google/siglip-base-patch16-224";

function l2(v) { let s = 0; for (const x of v) s += x * x; const n = Math.sqrt(s) || 1; return v.map((x) => x / n); }
function stub(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const out = new Array(DIM);
  for (let i = 0; i < DIM; i++) { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; out[i] = (h / 4294967295) * 2 - 1; }
  return l2(out);
}
async function embed(url) {
  if (!env.HF_TOKEN) return stub(url);
  try {
    const img = await fetch(url); if (!img.ok) return stub(url);
    const buf = Buffer.from(await img.arrayBuffer());
    const r = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.HF_TOKEN}`, "Content-Type": img.headers.get("content-type") || "image/jpeg", Accept: "application/json" },
      body: new Uint8Array(buf),
    });
    if (!r.ok) return stub(url);
    let d = await r.json();
    if (Array.isArray(d) && Array.isArray(d[0])) { const dim = d[0].length, acc = new Array(dim).fill(0); for (const row of d) for (let i = 0; i < dim; i++) acc[i] += row[i]; d = acc.map((x) => x / d.length); }
    return Array.isArray(d) && d.length === DIM ? l2(d) : stub(url);
  } catch { return stub(url); }
}
const CAT = (c = "") => {
  const s = c.toLowerCase();
  if (/dress|gown/.test(s)) return "dress";
  if (/shoe|sneaker|boot|heel|loafer|sandal|footwear/.test(s)) return "shoes";
  if (/jacket|coat|hoodie|sweater|cardigan|outerwear|blazer|puffer/.test(s)) return "outerwear";
  if (/pant|trouser|jean|short|skirt|legging|bottom/.test(s)) return "bottom";
  if (/bag|purse|tote|backpack|clutch/.test(s)) return "bag";
  if (/shirt|tee|top|blouse|polo|sweatshirt/.test(s)) return "top";
  return "accessory";
};

const { data: products, error } = await sb.from("products").select("*").limit(LIMIT);
if (error) { console.error("read products failed:", error.message); process.exit(1); }
console.log(`read ${products.length} products; embedding + upserting into shop_products…`);

let ok = 0, fail = 0;
for (const p of products) {
  if (!p.image_url || !p.product_url) { fail++; continue; }
  const emb = await embed(p.image_url);
  const { error: ue } = await sb.from("shop_products").upsert({
    source: p.source || "seed",
    external_id: String(p.id),
    brand: p.brand ?? null,
    title: p.title ?? "Item",
    category: CAT(p.category),
    price_cents: p.price != null ? Math.round(Number(p.price) * 100) : null,
    currency: p.currency || "USD",
    image_url: p.image_url,
    buy_url: p.product_url,
    in_stock: p.in_stock ?? true,
    attributes: { colors: p.colors ?? [], vibes: p.vibe_tags ?? [] },
    embedding: `[${emb.join(",")}]`,
    updated_at: new Date().toISOString(),
  }, { onConflict: "source,external_id" });
  if (ue) { fail++; if (fail <= 3) console.error("upsert err:", ue.message); } else ok++;
}
const { count } = await sb.from("shop_products").select("*", { count: "exact", head: true });
console.log(`done — upserted ${ok}, skipped/failed ${fail}. shop_products now has ${count} rows. HF_TOKEN=${env.HF_TOKEN ? "set (real embeddings)" : "absent (stub embeddings)"}`);
