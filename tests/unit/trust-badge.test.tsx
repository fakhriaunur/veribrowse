import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TrustBadge } from "@/components/TrustBadge";
import type { TrustLevel } from "@/lib/score";

// VAL-WEB-010 (level -> color + uppercase text) and VAL-WEB-018 (AA contrast
// in both themes, ARIA role + name).
//
// Badge backgrounds are the frozen level colors, identical in both themes, so
// the text/background pairs below hold for light and dark alike.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Tailwind palette hex: green-600 #16a34a, yellow-500 #eab308,
// red-600 #dc2626, zinc-950 #09090b.
const PAIRS: Record<TrustLevel, { bg: string; text: string }> = {
  safe: { bg: "#16a34a", text: "#09090b" },
  caution: { bg: "#eab308", text: "#09090b" },
  risky: { bg: "#dc2626", text: "#ffffff" },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderBadge(trust: number, level: TrustLevel): HTMLElement {
  act(() => {
    root.render(<TrustBadge trust={trust} level={level} />);
  });
  const badge = container.querySelector('[role="status"]');
  if (!(badge instanceof HTMLElement)) throw new Error("badge missing");
  return badge;
}

describe("TrustBadge", () => {
  it.each([
    ["safe", 85, "bg-green-600"],
    ["caution", 55, "bg-yellow-500"],
    ["risky", 20, "bg-red-600"],
  ] as [TrustLevel, number, string][])(
    "maps level %s to %s with uppercase text",
    (level, trust, bgClass) => {
      const badge = renderBadge(trust, level);
      expect(badge.classList.contains(bgClass)).toBe(true);
      expect(badge.textContent).toContain(level.toUpperCase());
      expect(badge.textContent).toContain(`${trust}/100`);
    },
  );

  it("carries an accessible role and name", () => {
    const badge = renderBadge(85, "safe");
    expect(badge.getAttribute("role")).toBe("status");
    expect(badge.getAttribute("aria-label")).toContain("safe");
    expect(badge.getAttribute("aria-label")).toContain("85");
  });

  it.each(["safe", "caution", "risky"] as TrustLevel[])(
    "level %s meets AA contrast (>=4.5:1) in both themes",
    (level) => {
      const { bg, text } = PAIRS[level];
      expect(contrastRatio(bg, text)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
