"use client";

import { BarChart3, Grid3x3, Repeat2, Shirt, Tag, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ProfileAvatar } from "../ProfileAvatar";

/** Minimal post shape a profile grid needs (works for both web + in-app). */
export interface ProfilePost {
  id: string;
  kind: string;
  imageUrl?: string;
  caption?: string;
  lookTitle?: string;
}

export interface ProfileScreenData {
  name: string;
  handle: string;
  avatar?: string;
  bio?: string;
  counts: { posts: number; followers: number; following: number };
  posts: ProfilePost[];
  tagged: ProfilePost[];
  shared: ProfilePost[];
}

type StatKey = "posts" | "followers" | "following";
type Tab = "posts" | "tagged" | "shared";

/**
 * Shared, presentational profile layout — the single source of truth for how a
 * user profile looks. Rendered by both the public guest page (/u/[handle]) and
 * the in-app other-user view (NativeUserProfileView). It holds no data-fetching
 * or navigation; callers pass resolved data, the action row, and optional
 * handlers. `loading` shows a placeholder before data arrives.
 */
export function ProfileScreen({
  data,
  actions,
  onStat,
  loading,
}: {
  data: ProfileScreenData | null;
  /** Action row under the bio (public: "Get the app" CTA; app: Follow + Message). */
  actions?: React.ReactNode;
  /** Tapping Followers / Following (app only). Posts always switches the tab. */
  onStat?: (which: Exclude<StatKey, "posts">) => void;
  loading?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("posts");

  if (loading || !data) {
    return <p className="py-16 text-center text-sm text-muted">Loading…</p>;
  }

  const list = tab === "posts" ? data.posts : tab === "tagged" ? data.tagged : data.shared;

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 pb-5 pt-1 text-center">
        <ProfileAvatar profile={{ avatarUrl: data.avatar, displayName: data.name }} size={92} />
        <div>
          <h1 className="heading text-xl leading-tight">{data.name}</h1>
          <p className="text-sm text-muted">@{data.handle}</p>
        </div>

        <div className="flex w-full max-w-xs items-center justify-around py-1">
          <Stat n={data.counts.posts} label="Posts" onClick={() => setTab("posts")} />
          <Stat n={data.counts.followers} label="Followers" onClick={onStat ? () => onStat("followers") : undefined} />
          <Stat n={data.counts.following} label="Following" onClick={onStat ? () => onStat("following") : undefined} />
        </div>

        {data.bio?.trim() && <p className="max-w-xs text-sm text-foreground/90">{data.bio}</p>}

        {actions && <div className="flex w-full max-w-xs items-center gap-2 pt-1">{actions}</div>}
      </div>

      {/* Tabs */}
      <div className="-mx-4 flex border-y border-line">
        <TabBtn Icon={Grid3x3} label="Posts" active={tab === "posts"} onClick={() => setTab("posts")} />
        <TabBtn Icon={Tag} label="Tagged" active={tab === "tagged"} onClick={() => setTab("tagged")} />
        <TabBtn Icon={Repeat2} label="Shared" active={tab === "shared"} onClick={() => setTab("shared")} />
      </div>

      {/* Grid */}
      <div className="-mx-4">
        {list.length ? (
          <div className="grid grid-cols-3 gap-0.5">
            {list.map((p) => (
              <div key={p.id} className="aspect-square overflow-hidden bg-surface-2">
                {p.kind === "poll" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-accent-soft p-2 text-center">
                    <BarChart3 size={20} className="text-accent" />
                    <span className="line-clamp-2 text-[10px] leading-tight text-foreground">{p.caption}</span>
                  </div>
                ) : (
                  <Thumb src={p.imageUrl} alt={p.caption || p.lookTitle || "post"} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-14 text-center text-sm text-muted">
            {tab === "posts" ? "No posts yet" : tab === "tagged" ? "No tagged posts" : "Nothing shared yet"}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex flex-col items-center px-2 disabled:cursor-default"
    >
      <span className="text-lg font-semibold leading-tight">{n}</span>
      <span className="text-xs text-muted">{label}</span>
    </button>
  );
}

function TabBtn({
  Icon,
  label,
  active,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm transition-colors ${
        active ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}

function Thumb({ src, alt }: { src?: string; alt?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted">
        <Shirt size={22} strokeWidth={1.5} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt ?? ""} onError={() => setErr(true)} className="h-full w-full object-cover" />;
}
