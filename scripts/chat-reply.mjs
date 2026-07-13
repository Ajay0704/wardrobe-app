/**
 * Post a chat message AS a fake user (testing only, AJA-110). Finds that user's
 * most-recently-active conversation and inserts a message from them via the admin
 * client (bypasses RLS). The bump_conversation trigger updates the preview/unread.
 *
 *   node scripts/chat-reply.mjs <handle> ["message text"]
 *   node scripts/chat-reply.mjs maya "Hey! Love that look 😄"
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const out = { ...process.env };
  for (const c of [new URL("../.env.local", import.meta.url), `${process.cwd()}/.env.local`]) {
    try {
      for (const line of readFileSync(c, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
      return out;
    } catch {
      /* next */
    }
  }
  return out;
}

const env = loadEnv();
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SERVICE) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const handle = process.argv[2] || "maya";
const body = process.argv[3] || "Hey! 😄 Love this — where's it from?";
const admin = createClient(SUPA_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: prof } = await admin
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .eq("username", handle)
    .maybeSingle();
  if (!prof) {
    console.error(`No profile @${handle}. Seed first: node scripts/seed-fake-profiles.mjs`);
    process.exit(1);
  }

  const { data: parts } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", prof.id);
  const convIds = (parts ?? []).map((p) => p.conversation_id);
  if (!convIds.length) {
    console.error(`@${handle} isn't in any conversation yet — start a chat with them in the app first.`);
    process.exit(1);
  }

  const { data: convs } = await admin
    .from("conversations")
    .select("id,last_message_at,created_at")
    .in("id", convIds)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const conv = convs?.[0];
  if (!conv) {
    console.error("Couldn't resolve a conversation.");
    process.exit(1);
  }

  const { error } = await admin.from("messages").insert({
    conversation_id: conv.id,
    sender_id: prof.id,
    sender_name: prof.display_name,
    sender_handle: prof.username,
    sender_avatar: prof.avatar_url,
    kind: "text",
    body,
  });
  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }
  console.log(`✓ ${prof.display_name} → conversation ${conv.id}\n  "${body}"`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
