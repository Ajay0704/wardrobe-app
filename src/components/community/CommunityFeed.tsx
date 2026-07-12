"use client";

import {
  BarChart3,
  Bookmark,
  Camera,
  Check,
  Heart,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPost,
  fetchFeed,
  toggleLike,
  toggleSave,
  votePoll,
  type CommunityPost,
  type PostKind,
} from "@/lib/community";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { resolveImageSource } from "@/lib/supabase/storage";

/**
 * The community feed — lives in Explore → "Following". A "Share a fit" composer
 * bar on top, then user-authored posts (OOTD / poll / style challenge) with
 * like, save, and poll voting. Posting persists to Supabase via community.ts.
 */
export function CommunityFeed() {
  const profile = useWardrobe((s) => s.profile);
  const authUser = useWardrobe((s) => s.authUser);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [createType, setCreateType] = useState<PostKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const moreRef = useRef<() => void>(() => {});

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    let alive = true;
    fetchFeed({}).then((r) => {
      if (!alive) return;
      setPosts(r.posts);
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const loadMore = useCallback(() => {
    if (loading || done || !cursor) return;
    setLoading(true);
    fetchFeed({ before: cursor }).then((r) => {
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...r.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
  }, [loading, done, cursor]);

  useEffect(() => {
    moreRef.current = loadMore;
  }, [loadMore]);

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    ioRef.current?.disconnect();
    ioRef.current = null;
    if (!node) return;
    const root = node.closest(".native-main") as HTMLElement | null;
    const io = new IntersectionObserver(
      (e) => e[0]?.isIntersecting && moreRef.current(),
      { root, rootMargin: "600px" },
    );
    io.observe(node);
    ioRef.current = io;
  }, []);

  const openCompose = (t: PostKind) => {
    if (!authUser) {
      flash("Sign in to post");
      return;
    }
    setCreateType(t);
  };

  const onCreated = (p: CommunityPost) => {
    setPosts((prev) => [p, ...prev]);
    setCreateType(null);
    flash("Posted to the feed");
  };

  return (
    <div className="space-y-3 pt-3">
      {/* Composer bar */}
      <div className="flex items-center gap-2.5 rounded-full border border-line bg-surface p-1.5 pl-1.5">
        <Avatar profile={profile} size={30} />
        <button
          type="button"
          onClick={() => openCompose("ootd")}
          className="flex-1 text-left text-sm text-muted"
        >
          Share a fit, poll, or challenge…
        </button>
        <QuickBtn icon={Camera} label="Post a fit" onClick={() => openCompose("ootd")} />
        <QuickBtn icon={BarChart3} label="Ask a poll" onClick={() => openCompose("poll")} />
        <QuickBtn icon={Sparkles} label="Style challenge" onClick={() => openCompose("style")} />
      </div>

      {posts.length === 0 && !loading ? (
        <div className="py-16 text-center text-sm text-muted">
          No posts yet — be the first to share a fit.
        </div>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} />)
      )}

      {loading && (
        <p className="py-6 text-center text-xs text-muted">Loading the feed…</p>
      )}
      {!done && posts.length > 0 && (
        <div ref={sentinelRef} className="py-4 text-center text-xs text-muted">
          More posts…
        </div>
      )}

      {createType && (
        <CreateSheet
          kind={createType}
          onClose={() => setCreateType(null)}
          onCreated={onCreated}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- post card */

function PostCard({ post }: { post: CommunityPost }) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [saved, setSaved] = useState(post.saved);
  const [saves, setSaves] = useState(post.saves);
  const [myVote, setMyVote] = useState<number | null>(post.myVote);
  const [counts, setCounts] = useState<number[]>(post.pollCounts);

  const onLike = () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    void toggleLike(post.id, next).catch(() => {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    });
  };
  const onSave = () => {
    const next = !saved;
    setSaved(next);
    setSaves((n) => n + (next ? 1 : -1));
    void toggleSave(post.id, next).catch(() => {
      setSaved(!next);
      setSaves((n) => n + (next ? -1 : 1));
    });
  };
  const onVote = (i: number) => {
    if (myVote !== null) return;
    setMyVote(i);
    setCounts((c) => c.map((v, idx) => (idx === i ? v + 1 : v)));
    void votePoll(post.id, i).catch(() => {});
  };

  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar profile={{ avatarUrl: post.authorAvatar, displayName: post.authorName }} size={30} />
        <p className="text-sm">
          <span className="font-medium">{post.authorName}</span>{" "}
          <span className="text-muted">@{post.authorHandle}</span>
        </p>
      </div>

      {post.kind === "poll" ? (
        <div className="px-3 pb-2">
          <p className="mb-2.5 font-medium">{post.caption}</p>
          <div className="space-y-2">
            {post.pollOptions.map((opt, i) => {
              const pct = total ? Math.round((counts[i] / total) * 100) : 0;
              const mine = myVote === i;
              if (myVote === null) {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onVote(i)}
                    className="w-full rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 text-left text-sm"
                  >
                    {opt}
                  </button>
                );
              }
              return (
                <div key={i} className="relative h-9 overflow-hidden rounded-xl bg-surface-2">
                  <div
                    className={`absolute inset-y-0 left-0 ${mine ? "bg-accent-soft" : "bg-line"}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-3 text-sm">
                    <span>{mine && <Check size={13} className="mr-1 inline text-accent" />}{opt}</span>
                    <span className="font-medium">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          {myVote !== null && (
            <p className="mt-1.5 text-xs text-muted">{total} vote{total === 1 ? "" : "s"}</p>
          )}
        </div>
      ) : (
        <>
          <PostImage src={post.imageUrl} kind={post.kind} />
          {post.kind === "style" ? (
            <div className="px-3 pt-2.5">
              <p className="text-sm">
                Recreate <span className="font-medium">{post.lookTitle}</span> from your closet
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-accent">
                <Sparkles size={13} /> style challenge · try it from your wardrobe
              </p>
            </div>
          ) : (
            post.caption && <p className="px-3 pt-2.5 text-sm">{post.caption}</p>
          )}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2">
              {post.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                  <ShoppingBag size={11} className="mr-1 inline" />
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-4 px-3 py-2.5 text-sm text-muted">
        <button type="button" onClick={onLike} className={liked ? "text-accent" : ""}>
          <Heart size={16} className={`mr-1 inline ${liked ? "fill-accent" : ""}`} />
          {likes}
        </button>
        <span>
          <MessageCircle size={16} className="mr-1 inline" />
          {post.comments}
        </span>
        <button type="button" onClick={onSave} className={`ml-auto ${saved ? "text-accent" : ""}`}>
          <Bookmark size={16} className={`mr-1 inline ${saved ? "fill-accent" : ""}`} />
          {saves}
        </button>
      </div>
    </article>
  );
}

function PostImage({ src, kind }: { src?: string; kind: PostKind }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex aspect-[4/5] w-full items-center justify-center bg-accent-soft text-accent">
        <Sparkles size={34} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={kind}
      onError={() => setErr(true)}
      className="max-h-[70vh] w-full object-cover"
    />
  );
}

/* ------------------------------------------------------------- create sheet */

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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const title = kind === "ootd" ? "Post a fit" : kind === "poll" ? "Ask a poll" : "Style challenge";
  const author = {
    name: profile.displayName?.trim() || "You",
    handle: profileHandle(profile),
    avatar: profile.avatarUrl,
  };

  const pickImage = async (file?: File) => {
    if (!file) return;
    try {
      setImageUrl(await resolveImageSource(file, authUser?.id ?? null));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't use that photo");
    }
  };

  const canPost =
    kind === "ootd"
      ? Boolean(imageUrl || caption.trim())
      : kind === "poll"
        ? caption.trim() && opts.filter((o) => o.trim()).length >= 2
        : Boolean(lookId);

  const submit = async () => {
    if (!canPost || busy) return;
    setBusy(true);
    setErr(null);
    try {
      let payload;
      if (kind === "ootd") {
        payload = { kind, imageUrl, caption: caption.trim() || undefined };
      } else if (kind === "poll") {
        payload = { kind, caption: caption.trim(), pollOptions: opts.map((o) => o.trim()).filter(Boolean) };
      } else {
        const look = outfits.find((o) => o.id === lookId);
        const first = look?.itemIds.map((id) => items.find((i) => i.id === id)).find(Boolean);
        payload = { kind, lookTitle: look?.name ?? "My look", imageUrl: first?.imageUrl };
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

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- shared */

function Avatar({
  profile,
  size,
}: {
  profile: { avatarUrl?: string; displayName?: string };
  size: number;
}) {
  const initials = (profile.displayName?.trim() || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-xs font-semibold text-accent"
      style={{ width: size, height: size }}
    >
      {profile.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

function QuickBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="px-1 text-accent">
      <Icon size={19} />
    </button>
  );
}
