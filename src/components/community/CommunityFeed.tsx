"use client";

import {
  Award,
  BarChart3,
  Bookmark,
  Camera,
  Check,
  Grid3x3,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  fetchComments,
  fetchFeed,
  fetchFollowing,
  toggleFollow,
  toggleLike,
  toggleSave,
  votePoll,
  type Comment,
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [authorIds, setAuthorIds] = useState<string[] | undefined>(undefined);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const moreRef = useRef<() => void>(() => {});
  const myId = authUser?.id ?? null;

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2000);
  };

  // Load who I follow, then show the "Following" feed (their posts + mine).
  // With no follows yet, fall back to all recent posts (discovery).
  useEffect(() => {
    let alive = true;
    (async () => {
      const followIds = myId ? await fetchFollowing(myId) : [];
      if (!alive) return;
      setFollowing(new Set(followIds));
      const ids = followIds.length && myId ? [...followIds, myId] : undefined;
      setAuthorIds(ids);
      const r = await fetchFeed({ authorIds: ids });
      if (!alive) return;
      setPosts(r.posts);
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [myId]);

  const onToggleFollow = (authorId: string, next: boolean) => {
    setFollowing((prev) => {
      const s = new Set(prev);
      if (next) s.add(authorId);
      else s.delete(authorId);
      return s;
    });
    void toggleFollow(authorId, next).catch(() => {});
  };

  const loadMore = useCallback(() => {
    if (loading || done || !cursor) return;
    setLoading(true);
    fetchFeed({ before: cursor, authorIds }).then((r) => {
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...r.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setLoading(false);
    });
  }, [loading, done, cursor, authorIds]);

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
          onClick={() => (authUser ? setPickerOpen(true) : flash("Sign in to post"))}
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
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            myId={myId}
            following={following.has(p.authorId)}
            onToggleFollow={onToggleFollow}
            onDeleted={() => setPosts((prev) => prev.filter((x) => x.id !== p.id))}
          />
        ))
      )}

      {loading && (
        <p className="py-6 text-center text-xs text-muted">Loading the feed…</p>
      )}
      {!done && posts.length > 0 && (
        <div ref={sentinelRef} className="py-4 text-center text-xs text-muted">
          More posts…
        </div>
      )}

      {pickerOpen && (
        <TypePicker
          onPick={(t) => {
            setPickerOpen(false);
            setCreateType(t);
          }}
          onClose={() => setPickerOpen(false)}
        />
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

/* --------------------------------------------------------------- type picker */

const POST_TYPES: { kind: PostKind; icon: LucideIcon; label: string; hint: string }[] = [
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

/* --------------------------------------------------------------- post card */

function PostCard({
  post,
  myId,
  following,
  onToggleFollow,
  onDeleted,
}: {
  post: CommunityPost;
  myId: string | null;
  following: boolean;
  onToggleFollow: (authorId: string, next: boolean) => void;
  onDeleted: () => void;
}) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [saved, setSaved] = useState(post.saved);
  const [saves, setSaves] = useState(post.saves);
  const [myVote, setMyVote] = useState<number | null>(post.myVote);
  const [counts, setCounts] = useState<number[]>(post.pollCounts);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments);
  const isMine = Boolean(myId && post.authorId === myId);

  const onDelete = () => {
    setMenuOpen(false);
    onDeleted();
    void deletePost(post.id).catch(() => {});
  };

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
        {!isMine && myId && (
          <button
            type="button"
            onClick={() => onToggleFollow(post.authorId, !following)}
            className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
              following
                ? "border border-line text-muted"
                : "bg-accent text-accent-foreground"
            }`}
          >
            {following ? "Following" : "Follow"}
          </button>
        )}
        {isMine && (
          <div className="relative ml-auto">
            <button
              type="button"
              aria-label="Post options"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 text-muted"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-line bg-surface shadow-lg shadow-black/10">
                  <button
                    type="button"
                    onClick={onDelete}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-surface-2"
                  >
                    <Trash2 size={15} /> Delete post
                  </button>
                </div>
              </>
            )}
          </div>
        )}
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
      ) : post.kind === "stat" ? (
        <div className="px-3 pb-1">
          <div className="rounded-2xl bg-accent-soft p-5 text-center">
            <p className="text-[11px] uppercase tracking-wide text-accent/80">Wardrobe stat</p>
            <p className="mt-1.5 font-medium">{post.lookTitle}</p>
            <p className="mt-1 text-lg font-semibold text-accent">{post.caption}</p>
          </div>
        </div>
      ) : post.kind === "tour" ? (
        <>
          <div className="grid grid-cols-3 gap-0.5">
            {post.pollOptions.map((src, i) => (
              <div key={i} className="aspect-square overflow-hidden bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
          {post.caption && <p className="px-3 pt-2.5 text-sm">{post.caption}</p>}
        </>
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
        <button type="button" onClick={() => setCommentsOpen(true)}>
          <MessageCircle size={16} className="mr-1 inline" />
          {commentCount}
        </button>
        <button type="button" onClick={onSave} className={`ml-auto ${saved ? "text-accent" : ""}`}>
          <Bookmark size={16} className={`mr-1 inline ${saved ? "fill-accent" : ""}`} />
          {saves}
        </button>
      </div>

      {commentsOpen && (
        <CommentSheet
          postId={post.id}
          onClose={() => setCommentsOpen(false)}
          onCountChange={(d) => setCommentCount((n) => Math.max(0, n + d))}
        />
      )}
    </article>
  );
}

/* -------------------------------------------------------------- comments */

function CommentSheet({
  postId,
  onClose,
  onCountChange,
}: {
  postId: string;
  onClose: () => void;
  onCountChange: (delta: number) => void;
}) {
  const profile = useWardrobe((s) => s.profile);
  const authUser = useWardrobe((s) => s.authUser);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchComments(postId).then((c) => {
      if (!alive) return;
      setComments(c);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [postId]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    if (!authUser) return;
    setBusy(true);
    try {
      const c = await addComment(postId, body, {
        name: profile.displayName?.trim() || "You",
        handle: profileHandle(profile),
        avatar: profile.avatarUrl,
      });
      if (c) {
        setComments((prev) => [...prev, c]);
        setText("");
        onCountChange(1);
      }
    } catch {
      // ignore — keep the text so they can retry
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    onCountChange(-1);
    void deleteComment(id).catch(() => {});
  };

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet flex max-h-[80vh] flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Comments"
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading text-lg">Comments</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-24 flex-1 space-y-3 overflow-y-auto py-1">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No comments yet — say something nice.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <Avatar profile={{ avatarUrl: c.authorAvatar, displayName: c.authorName }} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{c.authorName}</span>{" "}
                    <span className="text-muted">@{c.authorHandle}</span>
                  </p>
                  <p className="text-sm">{c.body}</p>
                </div>
                {authUser?.id === c.userId && (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    aria-label="Delete comment"
                    className="p-1 text-muted"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 border-t border-line pt-3">
          <input
            className="flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm"
            placeholder={authUser ? "Add a comment…" : "Sign in to comment"}
            value={text}
            disabled={!authUser}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || busy}
            aria-label="Send comment"
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              text.trim() && !busy ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted"
            }`}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
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
  const [pieceTags, setPieceTags] = useState<string[]>([]);
  const [tourImgs, setTourImgs] = useState<string[]>([]);
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
    try {
      let payload;
      if (kind === "ootd") {
        payload = { kind, imageUrl, caption: caption.trim() || undefined, tags: pieceTags };
      } else if (kind === "poll") {
        payload = { kind, caption: caption.trim(), pollOptions: opts.map((o) => o.trim()).filter(Boolean) };
      } else if (kind === "style") {
        const look = outfits.find((o) => o.id === lookId);
        const first = look?.itemIds.map((id) => items.find((i) => i.id === id)).find(Boolean);
        payload = { kind, lookTitle: look?.name ?? "My look", imageUrl: first?.imageUrl };
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

        {kind === "stat" && (
          statItem ? (
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
          )
        )}

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
