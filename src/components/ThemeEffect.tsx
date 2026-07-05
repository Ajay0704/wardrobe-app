"use client";

import { useEffect } from "react";
import { useWardrobe } from "@/lib/store";

/** Syncs the persisted theme preference to the <html> class list. */
export function ThemeEffect() {
  const theme = useWardrobe((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return null;
}
