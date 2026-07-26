import type { Metadata } from "next";
import { decodeItemPreview, getTheAppUrl } from "@/lib/item-share";
import { OpenInAppButton } from "./OpenInAppButton";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string | string[] }>;
};

function readParam(value?: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { d } = await searchParams;
  const preview = decodeItemPreview(readParam(d));
  const name = preview?.n?.trim() || "An item";
  const title = preview?.b ? `${name} · ${preview.b}` : name;
  const description = "Saved in Wardrobe — tap to open it in the app.";
  const images = preview?.i ? [preview.i] : [];
  return {
    title: `${title} · Wardrobe`,
    description,
    openGraph: { title, description, images, type: "website" },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}

/**
 * Public guest page for a shared wardrobe item — no app install required.
 * Renders the encoded preview and offers to open the exact item in the app.
 */
export default async function ItemSharePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { d } = await searchParams;
  const preview = decodeItemPreview(readParam(d));
  const name = preview?.n?.trim() || "This item";
  const brand = preview?.b?.trim();
  const image = preview?.i;

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <header className="border-b border-line px-4 py-4">
        <p className="brand-wordmark-kicker text-center text-xs text-muted">
          Your Personal
        </p>
        <p className="brand-wordmark-name text-center text-lg">Wardrobe</p>
      </header>

      <main className="mx-auto max-w-sm space-y-5 px-4 py-8">
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="flex aspect-square items-center justify-center bg-surface-2">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={name}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-sm text-muted">No preview</span>
            )}
          </div>
          <div className="space-y-1 px-4 py-4 text-center">
            <h1 className="text-lg font-semibold">{name}</h1>
            {brand && <p className="text-sm text-muted">{brand}</p>}
          </div>
        </div>

        <OpenInAppButton itemId={id} />

        <a
          href={getTheAppUrl()}
          className="block rounded-2xl border border-line bg-surface px-4 py-3.5 text-center text-sm font-medium text-foreground"
        >
          Get the app
        </a>

        <p className="text-center text-xs text-muted">Shared from Wardrobe</p>
      </main>
    </div>
  );
}
