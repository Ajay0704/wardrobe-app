"use client";

import { Compass, Heart, Sparkles, Users } from "lucide-react";
import { EmptyState } from "./ui";
import { useIsNativeApp } from "./NativeAppClass";

/**
 * Explore — the future social layer (outfit feed, follow friends, shared closets).
 * Placeholder for now; the social build comes later. Replaces the old "You" tab
 * in the bottom bar (profile moved to the header avatar).
 */
export function ExploreView() {
  const isNative = useIsNativeApp();
  const teasers = [
    { icon: Sparkles, label: "Outfit inspiration feed" },
    { icon: Users, label: "Follow friends' closets" },
    { icon: Heart, label: "Save and vote on looks" },
  ];
  return (
    <div className="space-y-6">
      {!isNative && <h2 className="heading text-2xl">Explore</h2>}
      <EmptyState
        title="A style community is coming"
        subtitle="Soon you'll discover outfits, follow friends, and share your best looks — powered by everyone's closets."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-medium text-accent">
            <Compass size={15} /> Coming soon
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {teasers.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <Icon size={17} />
            </span>
            <span className="text-sm">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
