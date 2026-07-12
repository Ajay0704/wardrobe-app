"use client";

import {
  Bookmark,
  Grid3x3,
  MapPin,
  Settings,
  Shirt,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { INSPIRATION_PINS } from "@/lib/explore";
import { profileHandle } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { ProfileAvatar } from "../ProfileAvatar";

type Tab = "outfits" | "items" | "saved";

/**
 * Instagram / TikTok–style social profile. Reached by tapping the avatar in the
 * top bar. Big centred avatar + @handle, tappable Outfits/Items/Saved counts,
 * Edit-profile / Share / Settings actions, then a 3-column tabbed grid of the
 * user's outfits, closet items, and saved Explore looks.
 */
export function NativeProfileView() {
  const profile = useWardrobe((s) => s.profile);
  const items = useWardrobe((s) => s.items);
  const outfits = useWardrobe((s) => s.outfits);
  const savedPinIds = useWardrobe((s) => s.savedPinIds);
  const setView = useWardrobe((s) => s.setView);

  const [tab, setTab] = useState<Tab>("outfits");
  const [toast, setToast] = useState<string | null>(null);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  const byId = useMemo(() => {
    const m = new Map<string, WardrobeItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);
  const savedPins = useMemo(
    () => INSPIRATION_PINS.filter((p) => savedPinIds.includes(p.id)),
    [savedPinIds],
  );

  const name = profile.displayName?.trim() || "You";
  const handle = useMemo(() => profileHandle(profile), [profile]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const share = async () => {
    const url =
      typeof window !== "undefined" ? window.location.origin : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${name} on Wardrobe`, url });
        return;
      }
      await navigator.clipboard?.writeText(url);
      flash("Profile link copied");
    } catch {
      /* user cancelled the share sheet — no-op */
    }
  };

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 pb-5 pt-1 text-center">
        <ProfileAvatar profile={profile} size={92} />
        <div>
          <h1 className="heading text-xl leading-tight">{name}</h1>
          <p className="text-sm text-muted">@{handle}</p>
        </div>

        {/* Stats */}
        <div className="flex w-full max-w-xs items-center justify-around py-1">
          <Stat n={outfits.length} label="Outfits" onClick={() => setView("outfits")} />
          <Stat n={owned.length} label="Items" onClick={() => setView("wardrobe")} />
          <Stat n={savedPins.length} label="Saved" onClick={() => setTab("saved")} />
        </div>

        {profile.bio?.trim() && (
          <p className="max-w-xs text-sm text-foreground/90">{profile.bio}</p>
        )}
        {profile.location?.trim() && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <MapPin size={13} /> {profile.location}
          </p>
        )}

        {/* Actions */}
        <div className="flex w-full max-w-xs items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setView("profile")}
            className="flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-semibold transition-colors hover:bg-surface-2"
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={share}
            className="flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-semibold transition-colors hover:bg-surface-2"
          >
            Share profile
          </button>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setView("you")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface transition-colors hover:bg-surface-2"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="-mx-4 flex border-y border-line">
        <TabBtn Icon={Grid3x3} label="Outfits" active={tab === "outfits"} onClick={() => setTab("outfits")} />
        <TabBtn Icon={Shirt} label="Items" active={tab === "items"} onClick={() => setTab("items")} />
        <TabBtn Icon={Bookmark} label="Saved" active={tab === "saved"} onClick={() => setTab("saved")} />
      </div>

      {/* Grid */}
      <div className="-mx-4">
        {tab === "outfits" &&
          (outfits.length ? (
            <Grid>
              {outfits.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setView("outfits")}
                  className="aspect-square overflow-hidden bg-surface-2"
                >
                  <OutfitCollage
                    itemImages={o.itemIds
                      .map((id) => byId.get(id)?.imageUrl)
                      .filter((u): u is string => !!u)}
                  />
                </button>
              ))}
            </Grid>
          ) : (
            <Empty icon={Grid3x3} label="No outfits yet" hint="Build a look and it shows up here." />
          ))}

        {tab === "items" &&
          (owned.length ? (
            <Grid>
              {owned.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setView("wardrobe")}
                  className="aspect-square overflow-hidden bg-surface-2"
                >
                  <Thumb src={it.imageUrl} alt={it.name} />
                </button>
              ))}
            </Grid>
          ) : (
            <Empty icon={Shirt} label="No items yet" hint="Add pieces to your closet to see them here." />
          ))}

        {tab === "saved" &&
          (savedPins.length ? (
            <Grid>
              {savedPins.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setView("explore")}
                  className="aspect-square overflow-hidden bg-surface-2"
                  style={{ background: p.tint }}
                >
                  <Thumb src={p.imageUrl} alt={p.title} />
                </button>
              ))}
            </Grid>
          ) : (
            <Empty icon={Bookmark} label="Nothing saved yet" hint="Tap the heart on Explore looks to save them." />
          ))}
      </div>

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

function Stat({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center px-2">
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
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-0.5">{children}</div>;
}

function Empty({
  icon: Icon,
  label,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-line text-muted">
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <p className="font-medium">{label}</p>
      <p className="max-w-[15rem] text-sm text-muted">{hint}</p>
    </div>
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
  return (
    <img
      src={src}
      alt={alt ?? ""}
      onError={() => setErr(true)}
      className="h-full w-full object-cover"
    />
  );
}

/** Up to a 2×2 collage of an outfit's item images (Instagram-grid feel). */
function OutfitCollage({ itemImages }: { itemImages: string[] }) {
  const imgs = itemImages.slice(0, 4);
  if (imgs.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted">
        <Grid3x3 size={22} strokeWidth={1.5} />
      </div>
    );
  }
  if (imgs.length === 1) return <Thumb src={imgs[0]} />;
  const cols = imgs.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2";
  return (
    <div className={`grid h-full w-full gap-px ${cols}`}>
      {imgs.map((src, i) => (
        <div key={i} className="overflow-hidden bg-surface-2">
          <Thumb src={src} />
        </div>
      ))}
    </div>
  );
}
