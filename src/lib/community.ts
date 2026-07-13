/**
 * Community feed data layer (AJA-95). User-authored posts — OOTD, polls, style
 * challenges — read/written through the browser Supabase client so RLS enforces
 * owner-only writes. Likes/saves counts are kept by DB triggers; poll tallies
 * are computed from poll_votes on read.
 */

import { getSupabase } from "./supabase/client";

export type PostKind = "ootd" | "poll" | "style" | "stat" | "tour";

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  kind: PostKind;
  imageUrl?: string;
  caption?: string;
  tags: string[];
  lookTitle?: string;
  pollOptions: string[];
  likes: number;
  saves: number;
  comments: number;
  createdAt: string;
  // per-viewer, resolved on read:
  liked: boolean;
  saved: boolean;
  myVote: number | null;
  pollCounts: number[];
}

export interface NewPost {
  kind: PostKind;
  imageUrl?: string;
  caption?: string;
  tags?: string[];
  lookTitle?: string;
  pollOptions?: string[];
}

export interface PostAuthor {
  name: string;
  handle: string;
  avatar?: string;
}

interface PostRow {
  id: string;
  author_id: string;
  author_name: string | null;
  author_handle: string | null;
  author_avatar: string | null;
  kind: PostKind;
  image_url: string | null;
  caption: string | null;
  tags: string[] | null;
  look_title: string | null;
  poll_options: string[] | null;
  likes: number | null;
  saves: number | null;
  comments: number | null;
  created_at: string;
}

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

function toPost(r: PostRow): CommunityPost {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name ?? "Someone",
    authorHandle: r.author_handle ?? "user",
    authorAvatar: r.author_avatar ?? undefined,
    kind: r.kind,
    imageUrl: r.image_url ?? undefined,
    caption: r.caption ?? undefined,
    tags: r.tags ?? [],
    lookTitle: r.look_title ?? undefined,
    pollOptions: r.poll_options ?? [],
    likes: r.likes ?? 0,
    saves: r.saves ?? 0,
    comments: r.comments ?? 0,
    createdAt: r.created_at,
    liked: false,
    saved: false,
    myVote: null,
    pollCounts: (r.poll_options ?? []).map(() => 0),
  };
}

/** Create a post authored by the current user. Returns the created post. */
export async function createPost(
  input: NewPost,
  author: PostAuthor,
): Promise<CommunityPost | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const uid = await currentUserId();
  if (!uid) throw new Error("Sign in to post");
  const { data, error } = await sb
    .from("posts")
    .insert({
      author_id: uid,
      author_name: author.name,
      author_handle: author.handle,
      author_avatar: author.avatar ?? null,
      kind: input.kind,
      image_url: input.imageUrl ?? null,
      caption: input.caption ?? null,
      tags: input.tags ?? [],
      look_title: input.lookTitle ?? null,
      poll_options: input.pollOptions ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toPost(data as PostRow);
}

export interface FeedPage {
  posts: CommunityPost[];
  nextCursor: string | null;
}

/**
 * Newest-first feed. `before` is an ISO created_at cursor for keyset paging.
 * Resolves the viewer's liked/saved/voted state + poll tallies in a few extra
 * queries so cards render fully.
 */
export async function fetchFeed(
  opts: { limit?: number; before?: string | null; authorIds?: string[] } = {},
): Promise<FeedPage> {
  const sb = getSupabase();
  if (!sb) return { posts: [], nextCursor: null };
  const limit = opts.limit ?? 15;
  let q = sb
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (opts.authorIds && opts.authorIds.length) q = q.in("author_id", opts.authorIds);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q;
  if (error) return { posts: [], nextCursor: null };
  const rows = (data ?? []) as PostRow[];
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).map(toPost);
  const nextCursor = hasMore && page.length ? page[page.length - 1].createdAt : null;

  await hydrateViewerState(page);
  return { posts: page, nextCursor };
}

/** Posts authored by a specific user (for the profile grid). */
export async function fetchUserPosts(authorId: string): Promise<CommunityPost[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("posts")
    .select("*")
    .eq("author_id", authorId)
    .order("created_at", { ascending: false });
  if (error) return [];
  const page = (data ?? []).map((r) => toPost(r as PostRow));
  await hydrateViewerState(page);
  return page;
}

/** Fill liked/saved/myVote + poll tallies for a set of posts. */
async function hydrateViewerState(page: CommunityPost[]): Promise<void> {
  const sb = getSupabase();
  if (!sb || !page.length) return;
  const ids = page.map((p) => p.id);
  const uid = await currentUserId();
  const byId = new Map(page.map((p) => [p.id, p]));

  const [likesRes, savesRes, votesRes] = await Promise.all([
    uid ? sb.from("post_likes").select("post_id").eq("user_id", uid).in("post_id", ids) : Promise.resolve({ data: [] }),
    uid ? sb.from("post_saves").select("post_id").eq("user_id", uid).in("post_id", ids) : Promise.resolve({ data: [] }),
    sb.from("poll_votes").select("post_id,user_id,option_idx").in("post_id", ids),
  ]);

  for (const r of (likesRes.data ?? []) as { post_id: string }[]) {
    const p = byId.get(r.post_id);
    if (p) p.liked = true;
  }
  for (const r of (savesRes.data ?? []) as { post_id: string }[]) {
    const p = byId.get(r.post_id);
    if (p) p.saved = true;
  }
  for (const v of (votesRes.data ?? []) as { post_id: string; user_id: string; option_idx: number }[]) {
    const p = byId.get(v.post_id);
    if (!p) continue;
    if (p.pollCounts[v.option_idx] != null) p.pollCounts[v.option_idx] += 1;
    if (uid && v.user_id === uid) p.myVote = v.option_idx;
  }
}

export async function toggleLike(
  postId: string,
  liked: boolean,
  author?: PostAuthor,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUserId();
  if (!uid) return;
  if (liked)
    await sb.from("post_likes").insert({
      post_id: postId,
      user_id: uid,
      // denormalized so the notification trigger can name the liker
      actor_name: author?.name ?? null,
      actor_handle: author?.handle ?? null,
      actor_avatar: author?.avatar ?? null,
    });
  else await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", uid);
}

export async function toggleSave(postId: string, saved: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUserId();
  if (!uid) return;
  if (saved) await sb.from("post_saves").insert({ post_id: postId, user_id: uid });
  else await sb.from("post_saves").delete().eq("post_id", postId).eq("user_id", uid);
}

export async function votePoll(
  postId: string,
  optionIdx: number,
  author?: PostAuthor,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUserId();
  if (!uid) return;
  await sb.from("poll_votes").insert({
    post_id: postId,
    user_id: uid,
    option_idx: optionIdx,
    actor_name: author?.name ?? null,
    actor_handle: author?.handle ?? null,
    actor_avatar: author?.avatar ?? null,
  });
}

/** Delete one of the current user's posts (RLS enforces ownership). */
export async function deletePost(postId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("posts").delete().eq("id", postId);
  if (error) throw new Error(error.message);
}

/** The current user's id, for "is this my post?" checks in the UI. */
export async function myUserId(): Promise<string | null> {
  return currentUserId();
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string | null;
  author_handle: string | null;
  author_avatar: string | null;
  body: string;
  created_at: string;
}

function toComment(r: CommentRow): Comment {
  return {
    id: r.id,
    postId: r.post_id,
    userId: r.user_id,
    authorName: r.author_name ?? "Someone",
    authorHandle: r.author_handle ?? "user",
    authorAvatar: r.author_avatar ?? undefined,
    body: r.body,
    createdAt: r.created_at,
  };
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("post_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => toComment(r as CommentRow));
}

export async function deleteComment(commentId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("post_comments").delete().eq("id", commentId);
}

/* ------------------------------------------------------------------ follows */

/** Ids of everyone the given user follows. */
export async function fetchFollowing(userId: string): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("follows").select("following_id").eq("follower_id", userId);
  return (data ?? []).map((r) => (r as { following_id: string }).following_id);
}

export async function fetchFollowCounts(
  userId: string,
): Promise<{ followers: number; following: number }> {
  const sb = getSupabase();
  if (!sb) return { followers: 0, following: 0 };
  const [followers, following] = await Promise.all([
    sb.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
    sb.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

export async function toggleFollow(
  targetId: string,
  follow: boolean,
  author?: PostAuthor,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUserId();
  if (!uid || uid === targetId) return;
  if (follow)
    await sb.from("follows").insert({
      follower_id: uid,
      following_id: targetId,
      actor_name: author?.name ?? null,
      actor_handle: author?.handle ?? null,
      actor_avatar: author?.avatar ?? null,
    });
  else await sb.from("follows").delete().eq("follower_id", uid).eq("following_id", targetId);
}

export async function addComment(
  postId: string,
  body: string,
  author: PostAuthor,
): Promise<Comment | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const uid = await currentUserId();
  if (!uid) throw new Error("Sign in to comment");
  const { data, error } = await sb
    .from("post_comments")
    .insert({
      post_id: postId,
      user_id: uid,
      author_name: author.name,
      author_handle: author.handle,
      author_avatar: author.avatar ?? null,
      body: body.trim(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toComment(data as CommentRow);
}
