"use client";

/**
 * The morning notification ask — the last step of First Six (AJA-277).
 *
 * ASKED HERE, NOT AT LAUNCH. Apple: "Sending the request in context provides a better
 * experience than automatically requesting authorization on first launch." By this screen the
 * user has an outfit of their own clothes, so there is something concrete to be notified about.
 *
 * EXPLICIT, NOT PROVISIONAL. Provisional authorisation looks attractive because it needs no
 * prompt, but Apple's own description rules it out for this purpose: provisional notifications
 * are delivered "quietly — they don't interrupt the person with a sound or banner, or appear on
 * the lock screen. Instead, they only appear in the notification center's history." That
 * protects an opt-in metric while guaranteeing the outfit is never seen. Plan for roughly half
 * of users declining: iOS opt-in runs ~44-56% across vendor benchmarks, and lifestyle sits only
 * marginally above the average.
 *
 * THE TIME IS THE USER'S. Stylebook is the one app in the category shipping this exact mechanic,
 * and its 4-star reviews name the flaw: the reminder time is not configurable, so early risers
 * get it after they've already left. Three sensible presets, not a time picker — the common
 * path first, per apple-design §16 simplicity.
 *
 * NO STREAK IS OFFERED HERE, deliberately. Duolingo's own published numbers put the causal
 * lift from solo streak mechanics at +1.7% D7 and +0.38% DAU — fractions of a percent — and a
 * streak on a payload whose quality we can't guarantee daily is how one hard Wordle ended 5.6
 * million of them. The daily value has to earn the habit first.
 */

import { useState } from "react";
import {
  enableNativeOutfitReminders,
  nativeNotificationsAvailable,
  savedReminderHour,
} from "@/lib/native-notifications";
import { Button } from "../ui";

const TIMES = [
  { hour: 6, minute: 30, label: "6:30" },
  { hour: 7, minute: 0, label: "7:00" },
  { hour: 7, minute: 30, label: "7:30" },
];

export default function MorningAsk({ onDone }: { onDone: () => void }) {
  const [picked, setPicked] = useState(() => {
    const saved = savedReminderHour();
    const i = TIMES.findIndex((t) => t.hour === saved);
    return i >= 0 ? i : 1;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = nativeNotificationsAvailable();

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { hour, minute } = TIMES[picked];
    const res = await enableNativeOutfitReminders(hour, minute);
    setBusy(false);
    // A decline is a legitimate answer, not a failure to recover from — say what happened and
    // let them through either way. Never trap the user (apple-design §16 wayfinding).
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <h2 className="heading text-2xl">Want tomorrow&apos;s outfit waiting for you?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          One notification in the morning. No streaks, no nagging — and you can turn it off in
          Settings whenever.
        </p>

        <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
          <p className="text-center text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">
            What time?
          </p>
          <div className="mt-3 flex gap-2">
            {TIMES.map((t, i) => (
              <button
                key={t.label}
                type="button"
                aria-pressed={picked === i}
                onClick={() => setPicked(i)}
                className={`flex-1 rounded-2xl border px-3 py-3 text-center text-[15px]
                  font-semibold transition-[transform,background-color,border-color]
                  duration-150 active:scale-[0.97] ${
                    picked === i
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-surface text-muted"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {!available && (
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Morning reminders work in the iOS app. We&apos;ll remember your time for when you
            open it there.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-[13px] leading-relaxed text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="flex-none pb-6 pt-3">
        <Button className="w-full" onClick={accept} disabled={busy}>
          {busy ? "Setting it up…" : "Yes, send it"}
        </Button>
        <Button variant="ghost" className="mt-1 w-full" onClick={onDone}>
          Not now
        </Button>
      </div>
    </div>
  );
}
