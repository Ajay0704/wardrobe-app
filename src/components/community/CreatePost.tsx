"use client";

import {
  Award,
  BarChart3,
  Camera,
  Check,
  Grid3x3,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPost, type CommunityPost, type PostKind } from "@/lib/community";
import { searchUsers, type SearchUser } from "@/lib/chat";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { resolveImageSource } from "@/lib/supabase/storage";
import { ProfileAvatar } from "../ProfileAvatar";

/**
 * Self-contained post composer, shared by the community feed (Explore) and the
 * profile page. Renders the type picker first (unless `initialKind` is given),
 * then the per-kind create sheet. Extracted from CommunityFeed so the profile's
 * "＋ New post" can open the exact same flow.
 */
export function CreatePostSheet({
  initialKind = null,
  onClose,
  onCreated,
}: {
  initialKind?: PostKind | null;
  onClose: () => void;
  onCreated: (p: CommunityPost) => void;
}) {
  const [kind, setKind] = useState<PostKind | null>(initialKind);
  if (!kind) return <TypePicker onPick={setKind} onClose={onClose} />;
  return <CreateSheet kind={kind} onClose={onClose} onCreated={onCreated} />;
}

/* --------------------------------------------------------------- type picker */

export const POST_TYPES: { kind: PostKind; icon: LucideIcon; label: string; hint: string }[] = [
  { kind: "ootd", icon: Camera, label: "Post a fit", hint: "Share your OOTD" },
  { kind: "poll", icon: BarChart3, label: "Ask a poll", hint: "Let followers vote" },
  { kind: "style", icon: Sparkles, label: "Style challenge", hint: "Others recreate from their closet" },
  { kind: "stat", icon: Award, label: "Stat card", hint: "Auto flex from your closet" },
  { kind: "tour", icon: Grid3x3, label: "Closet tour", hint: "Show your wardrobe" },
];

function TypePicker({
  onPick,
  onClose,
}: {
  onPick: (t: PostKind) => void;
  onClose: () => void;
}) {
  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="New post"
      >
        <div className="native-sheet-handle" />
        <h2 className="heading mb-2 text-lg">New post</h2>
        <div className="divide-y divide-line">
          {POST_TYPES.map(({ kind, icon: Icon, label, hint }) => (
            <button
              key={kind}
              type="button"
              onClick={() => onPick(kind)}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              <Icon size={20} className="text-accent" />
              <span className="flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <span className="text-muted">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- create sheet */

function CreateSheet({
  kind,
  onClose,
  onCreated,
}: {
  kind: PostKind;
  onClose: () => void;
  onCreated: (p: CommunityPost) => void;
}) {
  const profile = useWardrobe((s) => s.profile);
  const authUser = useWardrobe((s) => s.authUser);
  const outfits = useWardrobe((s) => s.outfits);
  const items = useWardrobe((s) => s.items);

  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [lookId, setLookId] = useState<string>(outfits[0]?.id ?? "");
  const [pieceTags, setPieceTags] = useState<string[]>([]);
  const [tourImgs, setTourImgs] = useState<string[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<SearchUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const owned = items.filter((i) => !i.wishlist);
  const statItem = owned
    .slice()
    .sort((a, b) => (b.wearCount ?? 0) - (a.wearCount ?? 0))[0];
  const statLine = statItem
    ? `${statItem.wearCount ?? 0}× worn${
        statItem.price
          ? ` · $${(statItem.price / Math.max(1, statItem.wearCount ?? 1)).toFixed(2)} per wear`
          : ""
      }`
    : "";

  const title = {
    ootd: "Post a fit",
    poll: "Ask a poll",
    style: "Style challenge",
    stat: "Stat card",
    tour: "Closet tour",
  }[kind];
  const author = {
    name: profile.displayName?.trim() || "You",
    handle: profileHandle(profile),
    avatar: profile.avatarUrl,
  };
  // People-tagging only makes sense on the image posts.
  const canTagPeople = kind === "ootd" || kind === "style";

  const pickImage = async (file?: File) => {
    if (!file) return;
    try {
      setImageUrl(await resolveImageSource(file, authUser?.id ?? null));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't use that photo");
    }
  };
  const toggleTag = (name: string) =>
    setPieceTags((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  const toggleTourImg = (src: string) =>
    setTourImgs((p) =>
      p.includes(src) ? p.filter((x) => x !== src) : p.length >= 6 ? p : [...p, src],
    );

  const canPost =
    kind === "ootd"
      ? Boolean(imageUrl || caption.trim())
      : kind === "poll"
        ? Boolean(caption.trim() && opts.filter((o) => o.trim()).length >= 2)
        : kind === "style"
          ? Boolean(lookId)
          : kind === "stat"
            ? Boolean(statItem)
            : tourImgs.length >= 2;

  const submit = async () => {
    if (!canPost || busy) return;
    setBusy(true);
    setErr(null);
    const taggedUserIds = taggedUsers.map((u) => u.id);
    try {
      let payload;
      if (kind === "ootd") {
        payload = { kind, imageUrl, caption: caption.trim() || undefined, tags: pieceTags, taggedUserIds };
      } else if (kind === "poll") {
        payload = { kind, caption: caption.trim(), pollOptions: opts.map((o) => o.trim()).filter(Boolean) };
      } else if (kind === "style") {
        const look = outfits.find((o) => o.id === lookId);
        const first = look?.itemIds.map((id) => items.find((i) => i.id === id)).find(Boolean);
        payload = { kind, lookTitle: look?.name ?? "My look", imageUrl: first?.imageUrl, taggedUserIds };
      } else if (kind === "stat") {
        payload = { kind, lookTitle: statItem!.name, caption: statLine, imageUrl: statItem!.imageUrl };
      } else {
        payload = { kind, caption: caption.trim() || "My closet tour", pollOptions: tourImgs };
      }
      const post = await createPost(payload, author);
      if (post) onCreated(post);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't post");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="native-sheet-handle" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="heading text-lg">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={!canPost || busy}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                canPost && !busy ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted"
              }`}
            >
              {busy ? "Posting…" : "Post"}
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
              <X size={20} />
            </button>
          </div>
        </div>

        {kind === "ootd" && (
          <>
            <label className="flex aspect-[4/5] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface-2/40 text-muted">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
              ) : (
                <>
                  <Camera size={30} />
                  <span className="text-sm">Add a photo of your fit</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </label>
            <textarea
              className="mt-3 min-h-16 w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm"
              placeholder="Say something about the fit…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={280}
            />
            {owned.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-muted">Tag pieces from your closet</p>
                <div className="flex flex-wrap gap-1.5">
                  {owned.slice(0, 24).map((it) => {
                    const on = pieceTags.includes(it.name);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => toggleTag(it.name)}
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          on ? "bg-accent text-accent-foreground" : "border border-line text-muted"
                        }`}
                      >
                        {on && <Check size={11} className="mr-1 inline" />}
                        {it.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {kind === "poll" && (
          <>
            <input
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm"
              placeholder="What should I wear to…?"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={140}
            />
            <div className="mt-3 space-y-2">
              {opts.map((o, i) => (
                <input
                  key={i}
                  className="w-full rounded-xl border border-line bg-surface p-2.5 text-sm"
                  placeholder={`Option ${i + 1}`}
                  value={o}
                  onChange={(e) => setOpts((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                  maxLength={60}
                />
              ))}
              {opts.length < 4 && (
                <button
                  type="button"
                  onClick={() => setOpts((p) => [...p, ""])}
                  className="text-sm text-accent"
                >
                  + Add option
                </button>
              )}
            </div>
          </>
        )}

        {kind === "style" && (
          <>
            <p className="mb-2 text-sm text-muted">
              Pick one of your outfits — followers recreate it from their own closet.
            </p>
            {outfits.length === 0 ? (
              <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
                Build an outfit first, then challenge the community to recreate it.
              </p>
            ) : (
              <div className="space-y-2">
                {outfits.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setLookId(o.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${
                      lookId === o.id ? "border-accent bg-accent-soft" : "border-line"
                    }`}
                  >
                    <Sparkles size={16} className="text-accent" />
                    <span className="flex-1 text-sm">{o.name}</span>
                    {lookId === o.id && <Check size={16} className="text-accent" />}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {kind === "stat" &&
          (statItem ? (
            <div className="rounded-2xl bg-accent-soft p-6 text-center">
              <p className="text-[11px] uppercase tracking-wide text-accent/80">Wardrobe stat</p>
              <p className="mt-2 font-medium">{statItem.name}</p>
              <p className="mt-1 text-lg font-semibold text-accent">{statLine}</p>
              <p className="mt-3 text-xs text-muted">Auto-generated from your closet — post it as a flex.</p>
            </div>
          ) : (
            <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
              Wear a few pieces (log them in your closet) and your stats will show up here.
            </p>
          ))}

        {kind === "tour" && (
          <>
            <input
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm"
              placeholder="Tour title — e.g. my 20-piece capsule"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={80}
            />
            <p className="mb-1.5 mt-3 text-xs text-muted">Pick pieces to show ({tourImgs.length}/6)</p>
            {owned.length === 0 ? (
              <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
                Add items to your closet to build a tour.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {owned.slice(0, 24).map((it) => {
                  const on = tourImgs.includes(it.imageUrl);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleTourImg(it.imageUrl)}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 ${
                        on ? "border-accent" : "border-transparent"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
                      {on && (
                        <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                          <Check size={10} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {canTagPeople && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted">Tag people</p>
            <TagPeople selected={taggedUsers} onChange={setTaggedUsers} />
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}

/** Debounced user search + multi-select, used to tag people in a post. */
function TagPeople({
  selected,
  onChange,
}: {
  selected: SearchUser[];
  onChange: (next: SearchUser[]) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      searchUsers(term).then((r) => {
        setResults(r);
        setSearching(false);
      });
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  const toggle = (u: SearchUser) => {
    const has = selected.some((s) => s.id === u.id);
    onChange(has ? selected.filter((s) => s.id !== u.id) : [...selected, u]);
  };

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
        <Search size={16} className="text-muted" />
        <input
          className="flex-1 bg-transparent text-sm outline-none"
          placeholder="Search people by name or @username"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u)}
              className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs text-accent"
            >
              {u.displayName || `@${u.username}`}
              <X size={12} />
            </button>
          ))}
        </div>
      )}

      {q.trim() && (
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {searching ? (
            <p className="py-3 text-center text-xs text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted">No one found for “{q.trim()}”.</p>
          ) : (
            results.map((u) => {
              const on = selected.some((s) => s.id === u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u)}
                  className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left hover:bg-surface-2"
                >
                  <ProfileAvatar
                    profile={{ avatarUrl: u.avatarUrl ?? undefined, displayName: u.displayName || u.username || "?" }}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.displayName || `@${u.username}`}</p>
                    {u.username && <p className="truncate text-xs text-muted">@{u.username}</p>}
                  </div>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      on ? "border-accent bg-accent text-accent-foreground" : "border-line text-transparent"
                    }`}
                  >
                    <Check size={14} />
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
