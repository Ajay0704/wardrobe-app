"use client";

import { useState } from "react";
import { BODY_SHAPES, FIT_PREFERENCES, type UserProfile } from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { Button, Chip, inputClass } from "../ui";
import { Group, Note, PageShell, PickRow, Row, Sheet, Snapshot } from "./settings-ui";

type SizeKey = "top" | "bottom" | "shoes" | "dress";
type SheetKind = "shop" | SizeKey | "fit" | "height" | "body" | null;

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
  const [sheet, setSheet] = useState<SheetKind>(null);

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

      {/* The try-on photo used to live here, behind a row that said "Added". It is now
          a top-level row in Settings → You that shows the photo itself (AJA-276) —
          discoverable, and one tap instead of three. Deliberately not duplicated here. */}

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
    </PageShell>
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
