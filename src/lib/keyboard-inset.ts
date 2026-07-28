/**
 * Keyboard-aware bottom insets (AJA-240 follow-up).
 *
 * A `position: fixed; bottom: 0` sheet is pinned to the LAYOUT viewport. When iOS
 * raises the keyboard it shifts the whole webview to reveal the focused field, so the
 * sheet rides up off-screen and you can't see what you're typing.
 *
 * The visual viewport is the part of the layout viewport you can actually see, so the
 * difference between the two IS the keyboard. We publish it as `--kb` and anchor the
 * sheet to that instead. Pure web — no native plugin, so it ships on a web deploy.
 *
 * Deliberately a shared, ref-counted singleton: several sheets can be mounted at once
 * (Vaul keeps them mounted to animate the exit), and they'd otherwise each attach
 * their own listeners and write the same variable.
 */

let refs = 0;
let detach: (() => void) | null = null;

/**
 * Mobile browser chrome (a collapsing URL bar) also shrinks the visual viewport, by
 * roughly 60–110px. Treating that as a keyboard would leave the sheet hovering above
 * the bottom of the website for no reason, so ignore anything too small to be one.
 */
const MIN_KEYBOARD = 120;

function apply() {
  const vv = window.visualViewport;
  if (!vv) return;
  // offsetTop covers the case where iOS scrolls the visual viewport rather than
  // resizing it; without it the inset reads 0 while the sheet is already off-screen.
  const raw = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  const inset = raw >= MIN_KEYBOARD ? raw : 0;
  document.documentElement.style.setProperty("--kb", `${Math.round(inset)}px`);

  // iOS may ALSO scroll the document to reveal the field. The app shell is a fixed
  // 100svh column that should never scroll, so undo it — otherwise the sheet is
  // correctly positioned but the whole page sits shifted underneath it.
  if (inset > 0 && window.scrollY !== 0) window.scrollTo(0, 0);
}

/** Start tracking; returns the release function. Safe to call on the server. */
export function acquireKeyboardInset(): () => void {
  if (typeof window === "undefined" || !window.visualViewport) return () => {};
  refs += 1;
  if (refs === 1) {
    const vv = window.visualViewport;
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    detach = () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.documentElement.style.setProperty("--kb", "0px");
    };
  }
  return () => {
    refs = Math.max(0, refs - 1);
    if (refs === 0 && detach) {
      detach();
      detach = null;
    }
  };
}
