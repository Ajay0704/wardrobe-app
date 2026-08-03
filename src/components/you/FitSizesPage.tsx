"use client";

import { Capacitor } from "@capacitor/core";
import { ScanFace } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pickNativePhoto } from "@/lib/native-camera";
import { BODY_SHAPES, FIT_PREFERENCES, type UserProfile } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { signedPrivateUrl } from "@/lib/supabase/private-storage";
import { Button, Chip, inputClass } from "../ui";
import { useTryOnPhoto } from "../useTryOnPhoto";
import { Group, Note, PageShell, PickRow, Row, Sheet, Snapshot } from "./settings-ui";

type SizeKey = "top" | "bottom" | "shoes" | "dress";
type SheetKind = "shop" | SizeKey | "fit" | "height" | "body" | "photo" | null;

const SHOP: { value: NonNullable<UserProfile["shopGender"]>; label: string }[] = [
  { value: "male", label: "Menswear" },
  { value: "female", label: "Womenswear" },
  { value: "all", label: "Everything" },
];
const shopLabel = (g: UserProfile["shopGender"]) =>
  SHOP.find((s) => s.value === (g ?? "all"))?.label ?? "Everything";

/**
 * Fit & sizes — the approved "Option C" quick list (AJA-202). A one-line snapshot
 * up top, then a tight tap-a-row-to-edit list; each row opens a small sheet. All
 * fields are private (size hints + try-on) and never shown on the public profile.
 */
export function FitSizesPage() {
  const profile = useWardrobe((s) => s.profile);
  const updateProfile = useWardrobe((s) => s.updateProfile);
  const authUser = useWardrobe((s) => s.authUser);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const { path: photoPath, save, remove, saveError } = useTryOnPhoto();

  const sizes = profile.sizes ?? {};
  const setSize = (k: SizeKey, v: string) =>
    updateProfile({ sizes: { ...sizes, [k]: v.trim() || undefined } });

  const snap = [
    shopLabel(profile.shopGender),
    sizes.top && `${sizes.top} top`,
    sizes.bottom && `${sizes.bottom} bottom`,
    profile.fitPreference,
    profile.bodyShape,
  ]
    .filter(Boolean)
    .join(" · ");

  const sizeSheet = (["top", "bottom", "shoes", "dress"] as SizeKey[]).includes(
    sheet as SizeKey,
  );

  return (
    <PageShell>
      <Snapshot>{snap}</Snapshot>
      <Note>
        Used for size hints on Shop and on-body try-on. Private to your account — never
        shown on your profile.
      </Note>

      <Group>
        <Row label="How you shop" value={shopLabel(profile.shopGender)} onClick={() => setSheet("shop")} chevron />
        <Row label="Top" value={sizes.top || "Add"} onClick={() => setSheet("top")} chevron />
        <Row label="Bottom" value={sizes.bottom || "Add"} onClick={() => setSheet("bottom")} chevron />
        <Row label="Shoes" value={sizes.shoes || "Add"} onClick={() => setSheet("shoes")} chevron />
        <Row label="Dress" value={sizes.dress || "Add"} onClick={() => setSheet("dress")} chevron />
        <Row label="Fit preference" value={profile.fitPreference || "Add"} onClick={() => setSheet("fit")} chevron />
        <Row label="Height" value={profile.heightCm ? `${profile.heightCm} cm` : "Add"} onClick={() => setSheet("height")} chevron />
        <Row label="Body shape" value={profile.bodyShape || "Add"} onClick={() => setSheet("body")} chevron />
      </Group>

      {/* AJA-276. Shown even when signed out — every other row on this page works
          without an account, and a row that appears and disappears with auth is more
          confusing than one that explains why it can't save. */}
      <Group label="On-body try-on">
        <Row
          icon={ScanFace}
          label="Try-on photo"
          value={authUser ? (photoPath ? "Added" : "Add") : "Sign in to save"}
          onClick={() => setSheet("photo")}
          chevron
        />
      </Group>
      <Note>
        Saved so try-on stops asking every time. Only you can see it, and removing it
        deletes the file.
      </Note>

      <Sheet open={sheet === "shop"} title="How you shop" onClose={() => setSheet(null)}>
          {SHOP.map((s) => (
            <PickRow
              key={s.value}
              active={(profile.shopGender ?? "all") === s.value}
              onClick={() => {
                updateProfile({ shopGender: s.value });
                setSheet(null);
              }}
            >
              <span className="flex-1">{s.label}</span>
            </PickRow>
          ))}
        </Sheet>

      <InputSheet
        open={sizeSheet}
        title={sizeSheet && sheet ? `${sheet[0].toUpperCase()}${sheet.slice(1)} size` : "Size"}
        initial={sizeSheet && sheet ? (sizes[sheet as SizeKey] ?? "") : ""}
        placeholder={sheet === "bottom" ? "32" : sheet === "shoes" ? "10" : "M"}
        onSave={(v) => sheet && setSize(sheet as SizeKey, v)}
        onClose={() => setSheet(null)}
      />

      <Sheet open={sheet === "fit"} title="Fit preference" onClose={() => setSheet(null)}>
          <div className="flex flex-wrap gap-2 pt-1">
            {FIT_PREFERENCES.map((f) => (
              <Chip
                key={f}
                active={profile.fitPreference === f}
                onClick={() => {
                  updateProfile({ fitPreference: profile.fitPreference === f ? undefined : f });
                  setSheet(null);
                }}
              >
                {f}
              </Chip>
            ))}
          </div>
        </Sheet>

      <InputSheet
        open={sheet === "height"}
        title="Height"
        initial={profile.heightCm ? String(profile.heightCm) : ""}
        placeholder="175"
        suffix="cm"
        numeric
        onSave={(v) => updateProfile({ heightCm: v.trim() ? Number(v) : undefined })}
        onClose={() => setSheet(null)}
      />

      <Sheet open={sheet === "body"} title="Body shape" onClose={() => setSheet(null)}>
          <div className="flex flex-wrap gap-2 pt-1">
            {BODY_SHAPES.map((b) => (
              <Chip
                key={b}
                active={profile.bodyShape === b}
                onClick={() => {
                  updateProfile({ bodyShape: profile.bodyShape === b ? undefined : b });
                  setSheet(null);
                }}
              >
                {b}
              </Chip>
            ))}
          </div>
        </Sheet>

      <Sheet open={sheet === "photo"} title="Try-on photo" onClose={() => setSheet(null)}>
        {sheet === "photo" && (
          <PhotoSheetBody
            path={photoPath}
            signedIn={!!authUser}
            saveError={saveError}
            onPick={save}
            onRemove={remove}
          />
        )}
      </Sheet>
    </PageShell>
  );
}

/**
 * Body is gated on the sheet being open (same pattern as `InputSheet`) so the preview
 * signs fresh each time rather than holding a URL past its 10-minute TTL.
 */
function PhotoSheetBody({
  path,
  signedIn,
  saveError,
  onPick,
  onRemove,
}: {
  path: string | undefined;
  signedIn: boolean;
  saveError: string | null;
  onPick: (file: File) => Promise<{ src: string; saved: boolean }>;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A signed URL is the right tool here and nowhere else in this feature: display
  // only, on screen for seconds, and a failure is VISIBLE rather than silently
  // substituting a stranger into a paid render.
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void signedPrivateUrl(path).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  const apply = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      await onPick(file);
      setUrl(null);
      setFailed(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read that photo.");
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    if (!Capacitor.isNativePlatform()) {
      fileRef.current?.click();
      return;
    }
    try {
      const file = await pickNativePhoto();
      if (file) await apply(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open the photo library.");
    }
  };

  return (
    <div className="pt-1">
      {path && (
        <div className="mb-3 overflow-hidden rounded-xl border border-line bg-surface-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Your try-on photo" className="mx-auto max-h-52 object-contain" />
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">
              {failed ? "That photo couldn't be loaded." : "Loading…"}
            </p>
          )}
        </div>
      )}

      {!signedIn && (
        <p className="mb-3 text-sm text-muted">
          Sign in to keep a photo. Until then try-on will ask for one each time, and it
          won&rsquo;t be stored.
        </p>
      )}
      {(err ?? saveError) && (
        <p className="mb-3 text-sm text-red-500">{err ?? saveError}</p>
      )}

      <Button onClick={() => void choose()} disabled={busy} className="w-full">
        {busy ? "Saving…" : path ? "Replace photo" : "Choose photo"}
      </Button>

      {/* Full length works better than a selfie — the render needs a body reference,
          and a head-and-shoulders shot leaves the model to invent the rest. */}
      <p className="mt-2 text-center text-[11px] text-muted">Full length works best.</p>

      {path &&
        (confirm ? (
          <div className="mt-3 rounded-xl border border-red-200 p-3 text-center">
            <p className="text-sm font-medium">Remove your try-on photo?</p>
            <p className="mt-1 text-xs text-muted">
              The file is deleted. Try-on will ask for a photo next time.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-xl border border-line py-2.5 text-sm"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirm(false);
                  onRemove();
                }}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <Row danger label="Remove photo" onClick={() => setConfirm(true)} />
          </div>
        ))}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void apply(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function InputSheet({
  open,
  title,
  initial,
  placeholder,
  suffix,
  numeric,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  initial: string;
  placeholder: string;
  suffix?: string;
  numeric?: boolean;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  // Body is gated on `open` so its `useState(initial)` re-seeds every time the
  // sheet reopens for a different field; BottomSheet latches it through the exit.
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {open && (
        <InputSheetBody
          initial={initial}
          placeholder={placeholder}
          suffix={suffix}
          numeric={numeric}
          onSave={onSave}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function InputSheetBody({
  initial,
  placeholder,
  suffix,
  numeric,
  onSave,
  onClose,
}: {
  initial: string;
  placeholder: string;
  suffix?: string;
  numeric?: boolean;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  const save = () => {
    onSave(v);
    onClose();
  };
  return (
    <>
      <div className="relative pt-1">
        <input
          className={inputClass}
          style={suffix ? { paddingRight: "2.75rem" } : undefined}
          value={v}
          autoFocus
          type={numeric ? "number" : "text"}
          inputMode={numeric ? "numeric" : undefined}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
            {suffix}
          </span>
        )}
      </div>
      <Button onClick={save} className="mt-4 w-full">
        Save
      </Button>
    </>
  );
}
