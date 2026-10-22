/**
 * AJA-299 — feeds the taste loop from everyday behaviour.
 *
 * AJA-260 made the engine read taste; until this, the only writer was the stylist's
 * thumbs, and nothing ever named a mismatched pair. Most people never open the
 * stylist, so for them taste was always empty. These are the moments that already
 * say what someone likes: saving a look, wearing it, flagging it, swapping a piece.
 *
 * Kept separate from engine-feedback.ts on purpose. Those events go to the server to
 * retune the weights for EVERYONE (AJA-255); taste is one person's local re-rank, and
 * it acts on their very next slate. Same moments, different questions, so the
 * telemetry contract stays untouched and this is a thin adapter beside it.
 *
 * Bad pairs are a HARD filter in the engine, so every rule that names one abstains
 * when the evidence is ambiguous. A missed pair costs another tap; a wrong one bans a
 * combination the user never objected to.
 */
import { isSampleItem } from "./demo-data";
import type { FlagReason } from "./engine-feedback";
import { colourPair } from "./outfit-rules";
import { recordBadPair, recordOutfitFeedback } from "./taste";
import type { WardrobeItem } from "./types";

/**
 * The real pieces of a look, or null when it isn't one. Starter samples are a demo,
 * not your clothes; and like `lookWorn`, a single garment is not a look.
 */
function lookOf(itemIds: string[], closet: WardrobeItem[], keep: (it: WardrobeItem) => boolean) {
  const items = [...new Set(itemIds)]
    .map((id) => closet.find((it) => it.id === id))
    .filter((it): it is WardrobeItem => !!it && !isSampleItem(it) && keep(it));
  return items.length >= 2 ? items : null;
}

/**
 * A saved look is a like — from ANY surface, hand-built or not. Broader than
 * `lookKept` deliberately: that decides whether the engine earned credit, and a
 * board you rebuilt by hand earns it none. Taste is about you, and a look you
 * composed yourself is the purest statement of it. A styled wish piece stays in:
 * you liked the look it makes.
 */
export function learnFromSave(itemIds: string[], closet: WardrobeItem[]): boolean {
  const items = lookOf(itemIds, closet, () => true);
  if (!items) return false;
  recordOutfitFeedback(items, "like");
  return true;
}

/** A worn look is a like. Wish pieces are dropped — you can't have worn them. */
export function learnFromWear(itemIds: string[], closet: WardrobeItem[]): boolean {
  const items = lookOf(itemIds, closet, (it) => !it.wishlist);
  if (!items) return false;
  recordOutfitFeedback(items, "like");
  return true;
}

/**
 * A flagged look is a dislike — except "weather". That complaint is about the day,
 * not the person: learning it would teach "you don't like wool" in July and quietly
 * bury the winter coat in January. A "Colours" flag also names the pair to avoid,
 * when one clearly stands out — returned, so the UI can say which. A ban nobody can
 * see is a ban nobody can notice is wrong.
 */
export function learnFromFlag(
  board: WardrobeItem[],
  reason: FlagReason,
): [WardrobeItem, WardrobeItem] | null {
  if (reason === "weather") return null;
  const items = lookOf(board.map((it) => it.id), board, () => true);
  if (!items) return null;
  const clash = reason === "colour" ? clearColourClash(items) : null;
  recordOutfitFeedback(items, "dislike", clash ? [clash[0].id, clash[1].id] : undefined);
  return clash;
}

/**
 * How far below every other pair the worst one has to sit before a colour complaint
 * is pinned on it. TUNE: over 900 slate looks from 300 random seven-piece closets this
 * names a pair on ~25% and abstains on the rest; 0.15 named one on ~35%.
 */
const CLASH_GAP = 0.2;

/**
 * The pair a "Colours" complaint is about, or null. A two-piece look has one pair, so
 * it is that. Otherwise it is the worst-scoring pair, and only when it is clearly
 * the worst: a top that clashes with BOTH the trousers and the shoes is a problem
 * with the top, not with either pairing.
 */
export function clearColourClash(items: WardrobeItem[]): [WardrobeItem, WardrobeItem] | null {
  const coloured = items.filter((it) => !!it.color);
  const pairs: { a: WardrobeItem; b: WardrobeItem; score: number }[] = [];
  for (let i = 0; i < coloured.length; i++) {
    for (let j = i + 1; j < coloured.length; j++) {
      const [a, b] = [coloured[i], coloured[j]];
      pairs.push({ a, b, score: colourPair(a.color, b.color).score });
    }
  }
  if (!pairs.length) return null;
  pairs.sort((x, y) => x.score - y.score);
  if (pairs.length > 1 && pairs[1].score - pairs[0].score < CLASH_GAP) return null;
  return [pairs[0].a, pairs[0].b];
}

/** A swap's improvement on one pairing has to clear this to count — mirrors COLOUR_DELTA. */
const SWAP_GAIN = 0.08;

/**
 * The piece left on the board that a colour swap was about, or null.
 *
 * Two signals have to agree: the pairing the replacement improved most, and the
 * removed piece's worst pairing. And the improvement has to dominate — at least
 * twice the next one — or the swap fixed the piece against everything, which blames
 * the piece rather than a pair. Over 120 swaps read as colour in random closets this
 * names a culprit for 64.
 */
export function colourSwapCulprit(
  removed: WardrobeItem,
  added: WardrobeItem,
  rest: WardrobeItem[],
): WardrobeItem | null {
  if (!removed.color || !added.color) return null;
  const rows = rest
    .filter((x) => !!x.color && x.id !== removed.id && x.id !== added.id)
    .map((x) => {
      const before = colourPair(removed.color, x.color).score;
      return { x, before, gain: colourPair(added.color, x.color).score - before };
    });
  if (!rows.length) return null;
  const byGain = [...rows].sort((p, q) => q.gain - p.gain);
  const worst = rows.reduce((m, r) => (r.before < m.before ? r : m));
  const top = byGain[0];
  if (top.gain < SWAP_GAIN) return null;
  if (byGain.length > 1 && byGain[1].gain > top.gain / 2) return null;
  return worst.x.id === top.x.id ? top.x : null;
}

/**
 * A swap the feedback layer read as "colour". Records ONLY the pair — the user fixed
 * the look rather than discarding it, so it isn't a dislike. Returns the piece the
 * removed one is no longer paired with, or null when the swap doesn't clearly name one.
 */
export function learnFromColourSwap(
  removed: WardrobeItem,
  added: WardrobeItem,
  rest: WardrobeItem[],
): WardrobeItem | null {
  const culprit = colourSwapCulprit(removed, added, rest);
  if (culprit) recordBadPair(removed.id, culprit.id);
  return culprit;
}
