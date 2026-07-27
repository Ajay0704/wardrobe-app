"use client";

import { useState } from "react";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currency";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  DEFAULT_LANGUAGE,
  LANGUAGES,
} from "@/lib/locale";
import {
  resolveStartView,
  START_SCREEN_OPTIONS,
  type StartScreen,
} from "@/lib/profile";
import { useWardrobe } from "@/lib/store";
import { Group, PageShell, PickRow, Row, Sheet } from "./settings-ui";

type SheetKind = "opens" | "currency" | "country" | "language" | null;

/** App & region (AJA-202) — the launch screen, currency, country, language, units. */
export function AppRegionPage() {
  const profile = useWardrobe((s) => s.profile);
  const updateProfile = useWardrobe((s) => s.updateProfile);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const start = resolveStartView(profile);
  const startLabel = START_SCREEN_OPTIONS.find((o) => o.id === start)?.label ?? "Explore";
  const currency = profile.currency ?? DEFAULT_CURRENCY;
  const tempUnit = profile.temperatureUnit ?? "C";

  return (
    <PageShell>
      <Group label="App">
        <Row label="Opens to" value={startLabel} onClick={() => setSheet("opens")} chevron />
      </Group>

      <Group label="Region">
        <Row label="Currency" value={currency} onClick={() => setSheet("currency")} chevron />
        <Row
          label="Country"
          value={profile.country ?? DEFAULT_COUNTRY}
          onClick={() => setSheet("country")}
          chevron
        />
        <Row
          label="Language"
          value={profile.language ?? DEFAULT_LANGUAGE}
          onClick={() => setSheet("language")}
          chevron
        />
        <Row
          label="Temperature"
          value={`°${tempUnit}`}
          onClick={() => updateProfile({ temperatureUnit: tempUnit === "C" ? "F" : "C" })}
        />
      </Group>

      <Sheet open={sheet === "opens"} title="App opens to" onClose={() => setSheet(null)}>
          {START_SCREEN_OPTIONS.map((o) => (
            <PickRow
              key={o.id}
              active={start === o.id}
              onClick={() => {
                updateProfile({ startView: o.id as StartScreen });
                setSheet(null);
              }}
            >
              <span className="flex-1">
                {o.label}
                {o.hint && <span className="text-muted"> · {o.hint}</span>}
              </span>
            </PickRow>
          ))}
        </Sheet>

      <Sheet open={sheet === "currency"} title="Currency" onClose={() => setSheet(null)}>
          {CURRENCIES.map((c) => (
            <PickRow
              key={c.code}
              active={currency === c.code}
              onClick={() => {
                updateProfile({ currency: c.code });
                setSheet(null);
              }}
            >
              <span className="w-8 text-center text-lg">{c.symbol}</span>
              <span className="flex-1">
                {c.label} <span className="text-muted">· {c.code}</span>
              </span>
            </PickRow>
          ))}
        </Sheet>

      <Sheet open={sheet === "country"} title="Country" onClose={() => setSheet(null)}>
          {COUNTRIES.map((c) => (
            <PickRow
              key={c}
              active={(profile.country ?? DEFAULT_COUNTRY) === c}
              onClick={() => {
                updateProfile({ country: c });
                setSheet(null);
              }}
            >
              <span className="flex-1">{c}</span>
            </PickRow>
          ))}
        </Sheet>

      <Sheet open={sheet === "language"} title="Language" onClose={() => setSheet(null)}>
          {LANGUAGES.map((l) => (
            <PickRow
              key={l.code}
              active={(profile.language ?? DEFAULT_LANGUAGE) === l.label}
              onClick={() => {
                updateProfile({ language: l.label });
                setSheet(null);
              }}
            >
              <span className="flex-1">{l.label}</span>
            </PickRow>
          ))}
        </Sheet>
    </PageShell>
  );
}
