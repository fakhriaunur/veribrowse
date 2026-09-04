// Client-only theme helpers (VAL-WEB-017).
// Choice persists in localStorage; first visit follows the OS
// prefers-color-scheme; failures fall back to light (default-safe).

export const THEME_KEY = "veribrowse:theme:v1";

export type ThemeName = "light" | "dark";

export function isThemeName(value: unknown): value is ThemeName {
  return value === "light" || value === "dark";
}

export function getStoredTheme(): ThemeName | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(THEME_KEY);
    return isThemeName(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  try {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Stored choice wins; otherwise the OS preference; otherwise light. */
export function resolveInitialTheme(): ThemeName {
  return getStoredTheme() ?? (systemPrefersDark() ? "dark" : "light");
}

/** Apply to <html> + persist. Best-effort: never throws. */
export function applyTheme(theme: ThemeName): void {
  try {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme is cosmetic — a full or blocked store must not break the page.
  }
}
