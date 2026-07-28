"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { acquireKeyboardInset } from "@/lib/keyboard-inset";

/**
 * The one bottom sheet for the whole app (AJA-222 follow-up). Wraps Vaul so every
 * sheet gets drag-to-dismiss with velocity/momentum + rubber-band, a symmetric
 * slide-down exit, a dim+blur scrim, scroll-lock, and reduced-motion — the
 * apple-design gaps the old CSS-only `.native-sheet` couldn't cover.
 *
 * Controlled: pass `open` + `onClose`. Vaul stays mounted so it can animate the
 * exit; we latch the last title/children so a data-driven sheet — rendered as
 * `{data && <Content/>}` — doesn't blank out during the slide-down, since the
 * parent clears `data` the instant it closes. The latch uses conditional
 * setState-during-render (React's sanctioned "derive from props" pattern), not an
 * effect or a ref read, to satisfy the strict react-hooks rules.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  ariaLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Optional centered title rendered above the content. */
  title?: string;
  /** Accessible label when there's no visible title (Vaul/Radix require a title). */
  ariaLabel?: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track the keyboard only while a sheet is open (see lib/keyboard-inset).
  useEffect(() => {
    if (!open) return;
    return acquireKeyboardInset();
  }, [open]);

  // Anchoring the sheet above the keyboard isn't enough on its own — the field can
  // still be below the fold inside a tall sheet. Bring the focused control into view
  // once the inset has settled.
  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !el) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !("scrollIntoView" in t)) return;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Two frames plus a beat: the keyboard animation has to finish resizing the
      // visual viewport before "centre it" means anything.
      window.setTimeout(() => {
        t.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
      }, 300);
    };
    el.addEventListener("focusin", onFocusIn);
    return () => el.removeEventListener("focusin", onFocusIn);
  }, [open]);

  const [held, setHeld] = useState<{ title?: string; node: ReactNode }>({
    title,
    node: children,
  });
  if (open && (held.node !== children || held.title !== title)) {
    setHeld({ title, node: children });
  }
  // While open, render live content; while closing, render the latched copy.
  const shown = open ? { title, node: children } : held;

  return (
    <Drawer.Root
      // Vaul's own keyboard handling badly overshoots inside a Capacitor WKWebView —
      // it shoved the sheet far above the keyboard, leaving the field off-screen. We
      // anchor to the visual viewport ourselves instead (--kb).
      repositionInputs={false}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="native-sheet-overlay" />
        <Drawer.Content className="native-sheet-content" aria-describedby={undefined}>
          <div className="native-sheet-grip" aria-hidden />
          <Drawer.Title className={shown.title ? "native-sheet-title" : "sr-only"}>
            {shown.title || ariaLabel || "Options"}
          </Drawer.Title>
          <div ref={scrollRef} className="native-sheet-scroll">
            {shown.node}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
