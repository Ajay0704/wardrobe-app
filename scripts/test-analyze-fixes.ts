/**
 * AJA-251 (malformed model JSON) + AJA-252 (colour naming).
 *
 * Both bugs were found by the WP0 eval harness against 157 real closet items, so the
 * fixtures below are the actual bytes that failed, not invented ones. The colour cases are
 * the real stored hexes; the JSON cases are trimmed from cached failures in
 * ~/Desktop/wardrobe-upload-research/eval/runs/.
 *
 * Run: npx tsx scripts/test-analyze-fixes.ts
 */
import { nameColor } from "../src/lib/color";
import { parseModelJson } from "../src/lib/model-json";

let failures = 0;

function check(cond: boolean, msg: string) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
}

// ---------------------------------------------------------------- AJA-251

console.log("\nAJA-251 — malformed model JSON");

const good = `{"name":"Grey polo","category":"top","fit":"regular"}`;
check(parseModelJson(good)?.category === "top", "clean JSON still parses");
check(
  parseModelJson("```json\n" + good + "\n```")?.category === "top",
  "fenced JSON still parses",
);

// The exact shape observed on "Marc O'Polo dark grey long sleeve" — a trailing extra brace.
const extraBrace = `{
  "name": "Dark Grey Long Sleeve",
  "category": "top",
  "styleCaption": "relaxed dark grey long sleeve for casual everyday wear"
}
}`;
check(parseModelJson(extraBrace)?.category === "top", "one closing brace too many is repaired");
check(
  parseModelJson(extraBrace)?.styleCaption === "relaxed dark grey long sleeve for casual everyday wear",
  "...and the values survive the repair intact",
);

// The exact shape observed on "Beige knit polo shirt" — the final brace never arrived.
const missingBrace = `{
  "name": "Beige Knit Polo",
  "category": "top",
  "fit": "regular",
  "styleCaption": "textured beige knit polo for a relaxed smart-casual look"`;
check(parseModelJson(missingBrace)?.category === "top", "missing final brace is repaired");
check(parseModelJson(missingBrace)?.fit === "regular", "...and the values survive that too");

const trailingComma = `{"name":"Black tee","category":"top",`;
check(parseModelJson(trailingComma)?.category === "top", "cut off after a trailing comma is repaired");

// The actual dominant failure: a complete object, then the model degenerates and repeats
// fragments of its own last string. Verbatim tails from cached failures.
const repeated = `{"name": "Grey Striped Dress Shirt", "category": "top", "styleCaption": "classic striped dress shirt for office wear"}\nwear"}`;
check(parseModelJson(repeated)?.category === "top", "repeated trailing fragment is ignored");
check(
  parseModelJson(repeated)?.styleCaption === "classic striped dress shirt for office wear",
  "...and the caption is the model's real one, not the fragment",
);

const degenerate = `{"name": "Under Armour Curry Flow Basketball Shoes", "category": "shoes", "brand": "Under Armour", "styleCaption": "performance basketball shoes for athletic wear"}\nwear"}\nwear"}\nwear"}\n"\n athletic wear"}\n\n\n\n\nwear"}`;
check(parseModelJson(degenerate)?.brand === "Under Armour", "severe repetition degeneration is survivable");

// Verbatim shape of the last 3 failures: a lone `"` between the final value and the brace.
const strayQuote = `{\n  "name": "Grey Dress Shirt",\n  "category": "top",\n  "tone": "neutral",\n  "styleCaption": "classic light grey dress shirt for office wear"\n"\n}`;
check(parseModelJson(strayQuote)?.category === "top", "a stray lone quote before the brace is repaired");
check(parseModelJson(`{"notes": ""}`)?.notes === "", "an intentionally empty string is untouched");

const spareBraces = `{"name": "Yellow Geometric Print Shirt", "category": "top", "tone": "warm"}\n}\n}`;
check(parseModelJson(spareBraces)?.tone === "warm", "two spare closing braces are ignored");

// A `}` inside a string must not be mistaken for the end of the object.
const braceInString = `{"name": "Shirt", "category": "top", "styleCaption": "the } character"}\njunk`;
check(
  parseModelJson(braceInString)?.styleCaption === "the } character",
  "a brace inside a string does not truncate the object",
);
const escapedQuote = `{"name": "24\\" waist jeans", "category": "bottom"}\njunk`;
check(parseModelJson(escapedQuote)?.category === "bottom", "an escaped quote does not confuse the scan");

// Guard rails: a repair must never invent a result out of nothing.
check(parseModelJson("") === null, "empty text returns null, not an object");
check(parseModelJson("I couldn't identify the garment.") === null, "prose returns null");
check(parseModelJson("[1,2,3]") === null, "a bare array is rejected — callers expect an object");
check(parseModelJson("{{{{") === null, "unrecoverable braces return null");

// ---------------------------------------------------------------- AJA-252

console.log("\nAJA-252 — colour naming");

// The three reported misses, all real stored closet colours.
check(nameColor("#121921") !== "beige", `#121921 (dark navy) is no longer "beige" — got "${nameColor("#121921")}"`);
check(nameColor("#1a1a1a") === "black", `#1a1a1a reads as black — got "${nameColor("#1a1a1a")}"`);
check(nameColor("#f3d19e") === "beige", `#f3d19e (pale sand) reads as beige — got "${nameColor("#f3d19e")}"`);

// Regressions the fix could plausibly have caused, each checked explicitly.
check(nameColor("#f0b79a") !== "beige", `peach #f0b79a stays a warm colour — got "${nameColor("#f0b79a")}"`);
check(nameColor("#22314f") === "navy", `navy #22314f still names navy — got "${nameColor("#22314f")}"`);
check(nameColor("#1c2331") === "navy", `dark navy #1c2331 still names navy — got "${nameColor("#1c2331")}"`);
check(nameColor("#6d2836") === "burgundy", `burgundy #6d2836 survives — got "${nameColor("#6d2836")}"`);
check(nameColor("#141414") === "black", `black #141414 unchanged — got "${nameColor("#141414")}"`);
check(nameColor("#f6f6f3") === "white", `white #f6f6f3 unchanged — got "${nameColor("#f6f6f3")}"`);
check(nameColor("#8a8a80") === "grey", `grey #8a8a80 unchanged — got "${nameColor("#8a8a80")}"`);
check(nameColor("#ddd0b8") === "beige", `beige #ddd0b8 unchanged — got "${nameColor("#ddd0b8")}"`);
check(nameColor("#c8a678") === "tan", `tan #c8a678 unchanged — got "${nameColor("#c8a678")}"`);
check(nameColor("#6f4a2c") === "brown", `brown #6f4a2c unchanged — got "${nameColor("#6f4a2c")}"`);
check(nameColor("#5f7a3a") === "olive", `olive #5f7a3a unchanged — got "${nameColor("#5f7a3a")}"`);
check(nameColor("#d2782f") === "orange", `orange #d2782f unchanged — got "${nameColor("#d2782f")}"`);
check(nameColor("#efe6d3") === "cream", `cream #efe6d3 unchanged — got "${nameColor("#efe6d3")}"`);

// The earth-word branch that prompted the original fix must still hold.
check(nameColor("#d2b48c") === "tan", `#d2b48c is tan, not orange — got "${nameColor("#d2b48c")}"`);

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n");
process.exit(failures ? 1 : 0);
