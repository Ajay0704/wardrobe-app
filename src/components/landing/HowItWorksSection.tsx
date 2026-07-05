import { demoItems } from "@/lib/demo-data";
import { CATEGORY_LABEL } from "@/lib/types";

const steps = [
  {
    n: "1",
    t: "Add your items",
    d: "Snap a photo or paste a link. Each piece is tagged by color, category, and season.",
  },
  {
    n: "2",
    t: "Build outfits",
    d: "Drag pieces together with a live preview and a color-match score.",
  },
  {
    n: "3",
    t: "Sync everywhere",
    d: "Your wardrobe saves to the cloud and follows you across devices.",
  },
];

export function HowItWorksSection() {
  const preview = demoItems.slice(0, 6);

  return (
    <section className="bg-[#0b0d11] text-white">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-32">
        <div className="text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-accent">
            How it works
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Your closet, digitized in minutes
          </h1>
          <p className="mx-auto mt-4 max-w-md text-white/70">
            Add pieces, build outfits, and get matched — here&apos;s what it
            looks like once you&apos;re in.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-sm font-medium">
                {s.n}
              </div>
              <div className="mt-4 text-lg font-medium">{s.t}</div>
              <p className="mt-2 text-sm text-white/60">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 overflow-hidden rounded-2xl border border-white/10 bg-[#111318]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="ml-2 text-xs text-white/40">
              Your wardrobe — 12 items
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
            {preview.map((it) => (
              <div
                key={it.id}
                className="overflow-hidden rounded-lg border border-white/10 bg-[#0b0d11]"
              >
                <div className="aspect-[3/4] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-2">
                  <div className="truncate text-xs font-medium">{it.name}</div>
                  <div className="truncate text-[11px] text-white/50">
                    {CATEGORY_LABEL[it.category]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 text-center">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/?auth=signup"
            className="inline-block rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Create account
          </a>
        </div>
      </div>
    </section>
  );
}
