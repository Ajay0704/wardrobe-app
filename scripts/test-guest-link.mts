/**
 * A guest who signs in with Google / Apple must keep the closet they captured (AJA-309).
 *
 * Run: npm run test:guest-link
 *
 * The bug this exists for: OAuth used a plain `signInWithOAuth`, which replaced the anonymous
 * guest with a NEW user. AuthProvider then pulled an empty snapshot and, by design, pushed an
 * empty closet over the device, so every piece the guest had just photographed vanished. Email
 * sign-up never had the problem because `convertGuest` upgrades the same user and pushes first.
 *
 * The fix links the provider to the guest (`linkIdentity`) and remembers, on-device, which user
 * the local closet belongs to. This file checks the decisions that make that work, plus source
 * guards on the three call sites so the wiring can't quietly regress.
 */
import { readFileSync } from "node:fs";
import {
  clearGuestOwner,
  linkFallbackProvider,
  parseAuthCallback,
  readGuestOwner,
  rememberGuestOwner,
  rememberPendingLink,
  seedForEmptyAccount,
  takePendingLink,
} from "@/lib/guest-link";
import type { WardrobeItem } from "@/lib/types";

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

// In-memory localStorage so the real helpers run unchanged.
const mem = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
};

const GUEST = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const piece = { id: "p1", name: "White shirt", category: "top" } as unknown as WardrobeItem;
const local = { items: [piece], outfits: [], calendar: [] };

console.log("\n=== the first pull after the upgrade keeps the guest's closet ===");
const same = seedForEmptyAccount(GUEST, GUEST, local);
ok(same.keptGuest && same.items.length === 1, "same user as the guest → local pieces kept");
const other = seedForEmptyAccount(OTHER, GUEST, local);
ok(!other.keptGuest && other.items.length === 0, "a different new account → still starts empty");
const none = seedForEmptyAccount(GUEST, null, local);
ok(!none.keptGuest && none.items.length === 0, "no guest recorded → still starts empty (old rule)");

console.log("\n=== guest owner marker ===");
rememberGuestOwner(GUEST);
ok(readGuestOwner() === GUEST, "remembered guest id reads back");
clearGuestOwner();
ok(readGuestOwner() === null, "cleared once the closet is in the cloud");

console.log("\n=== pending link survives the browser trip, once ===");
rememberPendingLink("apple");
ok(takePendingLink() === "apple", "pending provider reads back");
ok(takePendingLink() === null, "and is consumed, so it can't steer a later sign-in");
mem.set("wardrobe:oauth-link-pending", "facebook");
ok(takePendingLink() === null, "an unknown value is ignored");

console.log("\n=== callback parsing ===");
const success = parseAuthCallback(
  "app.wardrobe.personal://login-callback#access_token=AT&refresh_token=RT&type=bearer",
);
ok(success.accessToken === "AT" && success.refreshToken === "RT", "tokens read from the fragment");
const queryErr = parseAuthCallback(
  "app.wardrobe.personal://login-callback?error=server_error&error_code=identity_already_exists",
);
ok(queryErr.errorCode === "identity_already_exists" && !queryErr.accessToken, "error read from the query");
const both = parseAuthCallback(
  "app.wardrobe.personal://login-callback?error_code=a#error_code=identity_already_exists",
);
ok(both.errorCode === "identity_already_exists", "fragment wins when both carry a value");
ok(parseAuthCallback("app.wardrobe.personal://login-callback").errorCode === null, "bare callback → nothing");

console.log("\n=== which failures retry as a plain sign-in ===");
ok(linkFallbackProvider("identity_already_exists", "google") === "google", "account already exists → sign into it");
ok(linkFallbackProvider("access_denied", "google") === null, "any other error → stay on the sheet");
ok(linkFallbackProvider("identity_already_exists", null) === null, "no pending link (plain sign-in failed) → no retry");

console.log("\n=== wiring guards ===");
const oauth = readFileSync(new URL("../src/lib/supabase/oauth.ts", import.meta.url), "utf8");
const nativeBranch = oauth.slice(oauth.indexOf("if (isNativeApp()) {"), oauth.indexOf("async function openNativeSignIn"));
ok(
  /isGuestSession\(\)[\s\S]*linkIdentity\(/.test(nativeBranch),
  "native OAuth links the provider when the session is a guest",
);
ok(
  nativeBranch.indexOf("linkIdentity(") < nativeBranch.indexOf("openNativeSignIn("),
  "…and only falls back to a plain sign-in after that",
);
const provider = readFileSync(new URL("../src/components/AuthProvider.tsx", import.meta.url), "utf8");
const emptyBranch = provider.slice(provider.indexOf('status === "empty"'), provider.indexOf("await Promise.race"));
ok(emptyBranch.includes("seedForEmptyAccount("), "the empty-account branch asks seedForEmptyAccount what to keep");
ok(!/items:\s*\[\]/.test(emptyBranch), "THE regression guard: it no longer hard-codes an empty closet");
const native = readFileSync(new URL("../src/components/NativeAppClass.tsx", import.meta.url), "utf8");
ok(
  native.includes("takePendingLink()") && native.includes("if (!reopened)"),
  "deep link consumes the pending link and leaves a retried sign-in's browser open",
);

console.log(`\n${fails === 0 ? "ALL GUEST-LINK CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
