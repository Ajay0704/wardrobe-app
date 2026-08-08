/**
 * How many distinct outfits a set of pieces can make.
 *
 * ONE definition, because this number is now shown on two screens a minute apart — the onboarding
 * demo ("4 of 4 looks found") and the user's own first outfit ("4 outfits from 6 pieces"). If the
 * two ever disagree, the app has promised something in the demo it does not deliver.
 *
 * SHOES DO NOT MULTIPLY. Swapping footwear is a variation on a look, not another look. Counting it
 * would let six pieces claim eight outfits — technically arguable, and instantly read as inflation
 * by anyone who looks at their own closet. The whole point of the count is that the user can check
 * it by eye and find it honest.
 *
 * DRESSES ADD RATHER THAN MULTIPLY, since a dress is a complete look on its own.
 */
export function distinctLookCount(pieces: { category: string }[]): number {
  const n = (c: string) => pieces.filter((p) => p.category === c).length;
  return n("top") * n("bottom") + n("dress");
}
