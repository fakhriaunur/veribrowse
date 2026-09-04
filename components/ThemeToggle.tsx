"use client";

import { useEffect, useState } from "react";
import {
  THEME_KEY,
  applyTheme,
  resolveInitialTheme,
  type ThemeName,
} from "@/lib/theme";

/** Keyboard-reachable theme toggle (VAL-WEB-017). */
export function ThemeToggle() {
  // Server renders light (default-safe); the client syncs post-hydration so
  // there is no SSR mismatch, while the layout's inline script already set
  // data-theme pre-paint to avoid any wrong-theme flash.
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    setTheme(resolveInitialTheme());
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY && event.newValue !== theme) {
        setTheme(resolveInitialTheme());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [theme]);

  const next: ThemeName = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      aria-pressed={theme === "dark"}
      title="Toggle light/dark theme"
      className="inline-flex items-center gap-2 rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 dark:border-seam dark:bg-abyss dark:text-zinc-100 dark:hover:bg-coal"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
