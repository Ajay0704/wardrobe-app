/**
 * AJA-276 — gate for `profile.tryOnPhotoPath` and its persistence.
 *
 * Run: npm run test:tryon-photo
 *
 * The trap here is the INVERSE of the one `test-outfit-render.mts` guards. For items
 * and outfits the danger is a normalizer silently DROPPING a new field (AJA-223 /
 * 239 / 244 / 245). `profile` has no normalizer at all: `merge` spreads it whole,
 * `partialize` passes it whole, `sanitizeSnapshotForPush` copies every key. So the
 * field is never dropped — and nothing validates it either.
 *
 * That makes the dangerous value a SIGNED url. It is ~200 chars of `https:`, so
 * `isBadInline` (which only tests `^data:`) waves it through; it syncs to every
 * device and expires ten minutes later, leaving a screen that claims to have a saved
 * photo and can never load it. Everything below exists to prove the two guards that
 * stop that — the setter and `scrubSnapshotImages` — are actually wired in.
 *
 * NON-VACUITY RULE for this file: every "a bad value is rejected" assertion would
 * pass trivially if the field name were misspelled, because `undefined ===
 * undefined`. So each rejection assert is preceded by a "this slot demonstrably
 * works" assert on the same field. Do not remove those; they are the only thing
 * making the rest mean anything.
 */
const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.window = g;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
};
g.fetch = async () => ({ ok: true, json: async () => ({}) });
g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const { useWardrobe } = await import("@/lib/store");
const { scrubSnapshotImages } = await import("@/lib/heal");
const { DEFAULT_PROFILE } = await import("@/lib/profile");
const { sanitizeSnapshotForPush } = await import("@/lib/supabase/sync");

const PERSIST_KEY = "wardrobe-store-v2";
let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const USER = "4cea3e46-1f1b-4457-b57f-a02c2b6d5e1e";
const GOOD = `${USER}/${crypto.randomUUID()}.jpg`;
const SIGNED = `https://x.supabase.co/storage/v1/object/sign/renders-private/${GOOD}?token=eyJhbGci`;
const HUGE = "data:image/jpeg;base64," + "A".repeat(400_000);

const profile = () => useWardrobe.getState().profile;
const persistedProfile = () =>
  (JSON.parse(store.get(PERSIST_KEY) ?? "{}").state ?? {}).profile ?? {};
const rehydrateWith = async (p: Record<string, unknown>) => {
  store.set(PERSIST_KEY, JSON.stringify({ version: 0, state: { profile: p } }));
  await useWardrobe.persist.rehydrate();
  return profile();
};

// ---------------------------------------------------------------------------
console.log("\n=== 1. the setter validates on the way IN ===");
// This first assert is the non-vacuity anchor for everything below it.
useWardrobe.getState().setTryOnPhoto(GOOD);
ok(profile().tryOnPhotoPath === GOOD, "a valid path is stored", String(profile().tryOnPhotoPath));

useWardrobe.getState().setTryOnPhoto(SIGNED);
ok(
  profile().tryOnPhotoPath === undefined,
  "the setter REJECTS a signed URL rather than storing it",
  String(profile().tryOnPhotoPath).slice(0, 40),
);

useWardrobe.getState().setTryOnPhoto(GOOD);
useWardrobe.getState().setTryOnPhoto(HUGE);
ok(profile().tryOnPhotoPath === undefined, "the setter rejects an oversized data URL");

useWardrobe.getState().setTryOnPhoto(GOOD);
useWardrobe.getState().setTryOnPhoto(`${USER}/sub/nested.jpg`);
ok(profile().tryOnPhotoPath === undefined, "the setter rejects a NESTED path");

useWardrobe.getState().setTryOnPhoto(GOOD);
useWardrobe.getState().setTryOnPhoto(null);
ok(profile().tryOnPhotoPath === undefined, "null clears the photo");
ok(
  !("tryOnPhotoPath" in profile()),
  "…and the key is DELETED, not left as undefined (no noise in the pushed JSON)",
);

// The setter must not churn the profile reference when nothing actually changes:
// AuthProvider pushes a snapshot on any `profile` reference change, so a no-op write
// would fire a pointless network round trip.
useWardrobe.getState().setTryOnPhoto(GOOD);
const ref1 = profile();
useWardrobe.getState().setTryOnPhoto(GOOD);
ok(profile() === ref1, "re-setting the same path does NOT create a new profile object");

// A rejected NON-NULL write clears rather than silently keeping the old value. That
// is deliberate and matches `setOutfitRender`: the only caller passes the result of
// `uploadPrivateImage`, so an invalid non-null argument is a programming error, and
// leaving the store pointing at something the caller didn't ask for hides it. It is
// a genuine state change, so the reference updating here is correct, not churn.
useWardrobe.getState().setTryOnPhoto(SIGNED);
ok(
  profile().tryOnPhotoPath === undefined && profile() !== ref1,
  "a rejected write clears the field (a real change) instead of keeping a stale path",
);

// ---------------------------------------------------------------------------
console.log("\n=== 2. partialize ===");
useWardrobe.getState().setTryOnPhoto(GOOD);
ok(!!store.get(PERSIST_KEY), "the store actually wrote to localStorage");
ok(
  persistedProfile().tryOnPhotoPath === GOOD,
  "a good path reaches localStorage",
  JSON.stringify(persistedProfile().tryOnPhotoPath),
);

// The setter is not the only door: `updateProfile` is an unvalidated spread with ~40
// call sites. Prove the bypass LANDS first, or the assertion below proves nothing.
useWardrobe.getState().updateProfile({ tryOnPhotoPath: SIGNED });
ok(
  profile().tryOnPhotoPath === SIGNED,
  "updateProfile can bypass the setter (so the next assert is meaningful)",
);
ok(
  persistedProfile().tryOnPhotoPath === undefined,
  "partialize STRIPS a signed URL that bypassed the setter",
  String(persistedProfile().tryOnPhotoPath).slice(0, 40),
);

// ---------------------------------------------------------------------------
console.log("\n=== 3. merge: a corrupt persisted blob is cleaned, not trusted ===");
// `heightCm` rides along in every payload to prove the scrub is surgical rather than
// discarding the whole profile.
let after = await rehydrateWith({ tryOnPhotoPath: GOOD, heightCm: 175 });
ok(after.tryOnPhotoPath === GOOD, "a genuine path survives merge", String(after.tryOnPhotoPath));
ok(after.heightCm === 175, "…and an unrelated profile field survives alongside it");

after = await rehydrateWith({ tryOnPhotoPath: SIGNED, heightCm: 175 });
ok(after.tryOnPhotoPath === undefined, "a signed URL is stripped by merge");
ok(after.heightCm === 175, "…without collateral damage to the rest of the profile");

after = await rehydrateWith({ tryOnPhotoPath: HUGE });
ok(after.tryOnPhotoPath === undefined, "an oversized data URL is stripped by merge");

after = await rehydrateWith({ tryOnPhotoPath: `${USER}/sub/x.jpg` });
ok(after.tryOnPhotoPath === undefined, "a NESTED path is stripped by merge");

// ---------------------------------------------------------------------------
console.log("\n=== 4. composition with the avatarUrl branch ===");
// `scrubSnapshotImages` clones `profile` CONDITIONALLY, once per branch. If the
// tryOnPhotoPath branch is written as an independent `if` over `data.profile` instead
// of chaining off the running `profile` local, it clones a stale object and silently
// undoes the avatarUrl fix.
//
// A and B below are selectivity checks and do NOT catch that: each has only one dirty
// field, so only one branch ever clones and both spellings agree. Case C — BOTH
// fields dirty at once — is the only one that fails on the buggy spelling (it comes
// back with the oversized avatar resurrected). Verified by deliberately introducing
// the bug: A and B passed, C failed. Do not delete C.
const a = scrubSnapshotImages({ profile: { ...DEFAULT_PROFILE, avatarUrl: HUGE, tryOnPhotoPath: GOOD } });
ok(a.profile?.avatarUrl === undefined, "A: an oversized avatar is stripped…");
ok(a.profile?.tryOnPhotoPath === GOOD, "A: …while a good photo path is kept");

const b = scrubSnapshotImages({
  profile: { ...DEFAULT_PROFILE, avatarUrl: "https://cdn.example/a.jpg", tryOnPhotoPath: SIGNED },
});
ok(b.profile?.avatarUrl === "https://cdn.example/a.jpg", "B: a fine avatar is kept…");
ok(b.profile?.tryOnPhotoPath === undefined, "B: …while a signed photo path is stripped");

const bothDirty = scrubSnapshotImages({
  profile: { ...DEFAULT_PROFILE, avatarUrl: HUGE, tryOnPhotoPath: SIGNED, heightCm: 175 },
});
ok(
  bothDirty.profile?.tryOnPhotoPath === undefined,
  "C: with BOTH dirty, the signed photo path is stripped…",
);
ok(
  bothDirty.profile?.avatarUrl === undefined,
  "C: …AND the avatar fix survives — the branches compose rather than clobbering",
  String(bothDirty.profile?.avatarUrl).slice(0, 30),
);
ok(bothDirty.profile?.heightCm === 175, "C: …and unrelated fields are untouched");

const c = scrubSnapshotImages({ profile: { ...DEFAULT_PROFILE } });
ok(!("tryOnPhotoPath" in (c.profile ?? {})), "an absent field stays absent (no undefined noise)");

// ---------------------------------------------------------------------------
console.log("\n=== 5. sanitizeSnapshotForPush: the last gate before Postgres ===");
// flushPush reads the store directly, bypassing partialize, so for path-shaped
// fields this is the ONLY thing between memory and the database.
const snap = (p: Record<string, unknown>) => ({
  items: [],
  outfits: [
    { id: "o1", name: "signed", itemIds: [], createdAt: 1, tryOnRenderPath: SIGNED },
    { id: "o2", name: "good", itemIds: [], createdAt: 1, tryOnRenderPath: GOOD },
  ],
  calendar: [],
  profile: { ...DEFAULT_PROFILE, ...p },
  theme: "light" as const,
  draft: { top: [], bottom: [], dress: [], outerwear: [], shoes: [], accessories: [] },
});

const pushGood = sanitizeSnapshotForPush(snap({ tryOnPhotoPath: GOOD, heightCm: 175 }));
ok(
  pushGood.snapshot.profile.tryOnPhotoPath === GOOD,
  "a good path is pushed (so the next assert isn't vacuous)",
);
ok(pushGood.snapshot.profile.heightCm === 175, "…and the rest of the profile is intact");

const pushBad = sanitizeSnapshotForPush(snap({ tryOnPhotoPath: SIGNED, heightCm: 175 }));
ok(
  pushBad.snapshot.profile.tryOnPhotoPath === undefined,
  "a signed URL is stripped before push",
  String(pushBad.snapshot.profile.tryOnPhotoPath).slice(0, 40),
);
ok(pushBad.snapshot.profile.heightCm === 175, "…surgically, again");
// Same hole existed for renders and is closed by the same call.
ok(
  pushBad.snapshot.outfits[0].tryOnRenderPath === undefined &&
    pushBad.snapshot.outfits[1].tryOnRenderPath === GOOD,
  "the pre-existing tryOnRenderPath hole is closed by the same scrub",
);

const pushAvatar = sanitizeSnapshotForPush(snap({ avatarUrl: HUGE, tryOnPhotoPath: GOOD }));
ok(
  pushAvatar.snapshot.profile.avatarUrl === undefined && pushAvatar.stripped >= 0,
  "the existing inline-avatar behaviour still works after the scrub was chained in",
);

// ---------------------------------------------------------------------------
console.log("\n=== 6. DEFAULT_PROFILE must not carry the field ===");
// `merge` does `{ ...DEFAULT_PROFILE, ...persisted.profile }`. A default here would
// resurrect a value the scrubber had just removed.
ok(
  !("tryOnPhotoPath" in DEFAULT_PROFILE),
  "DEFAULT_PROFILE has no tryOnPhotoPath",
  JSON.stringify(Object.keys(DEFAULT_PROFILE)),
);

console.log(fails === 0 ? "\nTRYON-PHOTO CHECKS PASSED" : `\n${fails} TRYON-PHOTO CHECK(S) FAILED`);
if (fails) process.exit(1);
