/**
 * Seed 5 fake, searchable users for testing chat (AJA-110).
 *
 * Creates auth.users via the admin API (so conversations can reference them) and
 * upserts matching public.profiles rows (so username search finds them). Idempotent
 * — re-running reuses existing users by email.
 *
 * Requires the chat migration (20260718_chat.sql) to be applied first.
 * Run from the repo root:  node scripts/seed-fake-profiles.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- load env from .env.local (this is a standalone script, not Next) ---
function loadEnv() {
  const out = { ...process.env };
  const candidates = [new URL("../.env.local", import.meta.url), `${process.cwd()}/.env.local`];
  for (const c of candidates) {
    try {
      const txt = readFileSync(c, "utf8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
      return out;
    } catch (e) {
      // try next candidate
    }
  }
  return out;
}

const env = loadEnv();
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(SUPA_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const PASSWORD = "Testpass123!";
const PEOPLE = [
  { email: "maya.test@wardrobe.dev", username: "maya", displayName: "Maya Rivera", bio: "Minimalist. Neutral tones only." },
  { email: "jordan.test@wardrobe.dev", username: "jordanlee", displayName: "Jordan Lee", bio: "Streetwear + sneakers." },
  { email: "priya.test@wardrobe.dev", username: "priya", displayName: "Priya Nair", bio: "Colour and prints." },
  { email: "sam.test@wardrobe.dev", username: "samc", displayName: "Sam Carter", bio: "Workwear capsule." },
  { email: "aisha.test@wardrobe.dev", username: "aisha", displayName: "Aisha Khan", bio: "Cozy knits, always." },
];

async function findUserByEmail(email) {
  // listUsers is paginated; scan a few pages for the email.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureUser(p) {
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      const existing = await findUserByEmail(p.email);
      if (existing) return existing.id;
    }
    throw new Error(`${p.email}: ${error.message}`);
  }
  return data.user.id;
}

async function main() {
  for (const p of PEOPLE) {
    const id = await ensureUser(p);
    const { error } = await admin.from("profiles").upsert(
      {
        id,
        username: p.username,
        display_name: p.displayName,
        bio: p.bio,
        avatar_url: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error(`profile upsert failed for @${p.username}: ${error.message}`);
      continue;
    }
    console.log(`✓ @${p.username}  (${p.displayName})  ${p.email}`);
  }
  console.log(`\nAll set. Sign in as any of them with password: ${PASSWORD}`);
  console.log("Search them in New message by name or @handle.");
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
