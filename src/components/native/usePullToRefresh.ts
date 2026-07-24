import { useEffect, useRef, useState } from "react";

/** Pull distance (px) required to trigger a refresh. */
export const PTR_THRESHOLD = 64;
/** Max visual pull distance (px) — the drag is damped past this. */
const PTR_MAX = 96;

/**
 * Pull-to-refresh for the native shell's shared scroll container
 * (`.native-main`). When that container is scrolled to the top and the user
 * drags down past PTR_THRESHOLD, `onRefresh` runs. Returns the live pull
 * distance and a `refreshing` flag so the caller can render an indicator.
 *
 * `enabled` gates it to one view at a time (the scroll container is shared, so
 * only the active screen that opts in gets the gesture). WKWebView bounces at
 * the top by default; we `preventDefault` the downward drag to own it.
 */
export function usePullToRefresh(
  enabled: boolean,
  onRefresh: () => Promise<void> | void,
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busyRef = useRef(false);
  const cb = useRef(onRefresh);
  useEffect(() => {
    cb.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;
    const el = document.querySelector<HTMLElement>(".native-main");
    if (!el) return;

    const setP = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const onStart = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1) {
        startY.current = null;
        return;
      }
      startY.current = el.scrollTop <= 0 ? e.touches[0].clientY : null;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || busyRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || el.scrollTop > 0) {
        if (pullRef.current) setP(0);
        return;
      }
      e.preventDefault(); // own the gesture — no native rubber-band
      setP(Math.min(PTR_MAX, dy * 0.5));
    };

    const finish = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= PTR_THRESHOLD) {
        busyRef.current = true;
        setRefreshing(true);
        setP(PTR_THRESHOLD);
        try {
          await cb.current();
        } finally {
          busyRef.current = false;
          setRefreshing(false);
          setP(0);
        }
      } else {
        setP(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", finish);
    el.addEventListener("touchcancel", finish);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", finish);
    };
  }, [enabled]);

  return { pull, refreshing };
}
