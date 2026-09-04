import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  THEME_KEY,
  applyTheme,
  getStoredTheme,
  resolveInitialTheme,
  systemPrefersDark,
} from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";

// VAL-WEB-017: toggle is labeled + keyboard-reachable, choice persists,
// first visit follows the OS preference.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function renderToggle() {
  act(() => {
    root.render(<ThemeToggle />);
  });
  const button = container.querySelector("button");
  if (!button) throw new Error("ThemeToggle did not render a button");
  return button;
}

describe("lib/theme", () => {
  it("returns null when nothing is stored", () => {
    expect(getStoredTheme()).toBeNull();
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem(THEME_KEY, "midnight");
    expect(getStoredTheme()).toBeNull();
  });

  it("reads a valid stored choice", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("stored choice wins over the OS preference", () => {
    mockMatchMedia(true);
    window.localStorage.setItem(THEME_KEY, "light");
    expect(resolveInitialTheme()).toBe("light");
  });

  it("first visit follows a dark OS preference", () => {
    mockMatchMedia(true);
    expect(systemPrefersDark()).toBe(true);
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("first visit defaults to light without a dark OS preference", () => {
    mockMatchMedia(false);
    expect(resolveInitialTheme()).toBe("light");
  });

  it("applyTheme sets data-theme and persists", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
  });
});

describe("ThemeToggle", () => {
  it("is a labeled, keyboard-reachable button", () => {
    const button = renderToggle();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-label")).toBe("Switch to dark theme");
    expect(button.hasAttribute("aria-pressed")).toBe(true);
    expect(button.getAttribute("type")).toBe("button");
  });

  it("toggles theme and persists the choice", () => {
    const button = renderToggle();
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(button.getAttribute("aria-label")).toBe("Switch to light theme");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("starts from the stored choice", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    document.documentElement.dataset.theme = "dark";
    const button = renderToggle();
    expect(button.getAttribute("aria-label")).toBe("Switch to light theme");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });
});
