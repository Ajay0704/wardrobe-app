/**
 * Parsing JSON out of a model reply, tolerating the ways a model malforms one.
 *
 * Gemini does this even with `responseMimeType: "application/json"`. Measured across 157
 * real closet photos through `/api/analyze` (AJA-251), 20 of them — 12.7% — failed a strict
 * `JSON.parse`, and in every case the object itself was complete and its values correct.
 * 17 of the 20 succeeded on a plain re-request, so it's nondeterministic rather than a
 * property of the photo.
 *
 * The failure mattered because it was silent: the route answered 502, `import-queue.ts`
 * swallowed it, and the item was stored with no attributes while the progress pill still
 * counted it as done — the likeliest source of the closet's ~20% attribute coverage holes.
 *
 * Two distinct malformations showed up in the captured failures, and the common one is not
 * the one you would guess:
 *
 * 1. **Trailing junk after a complete object** (5 of the 6 hardest cases). The model closes
 *    the object correctly and then keeps going, repeating fragments of its own last string:
 *    `…"classic striped dress shirt for office wear"}\nwear"}`, or in the worst case
 *    `…wear"}\nwear"}\nwear"}\n\n\n\nwear"}`. Sometimes it is just a stray extra `}`.
 *    `JSON.parse` rejects the entire response over the garbage that follows a perfectly
 *    good object, so the fix is to read only the first balanced object and stop.
 * 2. **A truncated object** — the final `}` never arrives at all.
 * 3. **A stray lone `"`** on its own line between the last value and the closing brace:
 *    `…"classic faded grey jeans for everyday casual wear"\n"\n}`. This was the entire
 *    residual after fixing (1) and (2) — 3 of 157, all identical in shape.
 *
 * The untouched text is always tried first, so no repair can ever corrupt a valid response:
 * a repair is only reached once a strict parse has already failed.
 *
 * Its own module rather than living beside one caller: every route that asks a model for
 * JSON has the same exposure, so a fix that only covered `/api/analyze` would leave the
 * identical crash in the detector one step earlier in the same upload.
 */

/**
 * The first balanced `{…}` in the text, ignoring anything after it.
 *
 * Brace counting has to respect string literals, or a `}` inside a styleCaption ends the
 * object early and the result parses to something subtly wrong — worse than failing.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
    } else if (ch === "\\") {
      escaped = inString;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // never closed — a truncation, handled by the caller's fallbacks
}

/**
 * Candidates are tried cheapest-first and one only wins if it yields an object. Null means
 * genuinely unusable, which callers must still handle — this makes the failure rare, not
 * impossible. Measured residual after this: 1 of 157, a response with a stray quote mid-object.
 */
export function parseModelJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  const candidates = [
    cleaned, // the overwhelmingly common case: it's just fine
    firstBalancedObject(cleaned), // trailing junk, repeated fragments, or a spare `}`
    `${cleaned}}`, // truncated before the final brace
    `${cleaned.replace(/,\s*$/, "")}}`, // truncated just after a trailing comma
    cleaned.replace(/"\s*"\s*\}$/, '"}'), // a stray lone `"` between the last value and `}`
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not this shape — try the next repair.
    }
  }
  return null;
}
