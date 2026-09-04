import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecentsCompare } from "@/components/RecentsCompare";
import type { RecentEntry } from "@/lib/recents";

// Compare view (VAL-WEB-019): list + side-by-side compare + user clear.
// No-WebMCP path: pure client rendering, no fetch, no server routes.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const two: RecentEntry[] = [
  {
    kind: "score",
    id: "score-1",
    url: "https://a.example",
    trust: 85,
    level: "safe",
    summary: "Safe summary",
    at: "2026-09-04T00:00:00.000Z",
  },
  {
    kind: "check",
    id: "check-1",
    claim: "a claim with enough length",
    verdict: "supported",
    confidence: 0.82,
    evidenceCount: 1,
    summary: "Supported summary",
    at: "2026-09-04T00:00:00.000Z",
  },
];

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

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

describe("RecentsCompare", () => {
  it("shows an empty state before the first run", () => {
    render(
      <RecentsCompare recents={[]} onClear={() => {}} onRemove={() => {}} />,
    );
    expect(container.textContent).toContain("No recent results yet");
  });

  it("lists recents and clears via the user button", () => {
    const onClear = vi.fn();
    const onRemove = vi.fn();
    render(
      <RecentsCompare recents={two} onClear={onClear} onRemove={onRemove} />,
    );
    expect(container.textContent).toContain("https://a.example");
    expect(container.textContent).toContain("a claim with enough length");
    const clear = container.querySelector(
      'button[aria-label="Clear recent results"]',
    );
    expect(clear).not.toBeNull();
    act(() => {
      (clear as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders two selected results side by side", () => {
    render(
      <RecentsCompare recents={two} onClear={() => {}} onRemove={() => {}} />,
    );
    const selects = container.querySelectorAll("select");
    expect(selects).toHaveLength(2);
    act(() => {
      selects[0].value = "score-1";
      selects[0].dispatchEvent(new Event("change", { bubbles: true }));
      selects[1].value = "check-1";
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    const region = container.querySelector(
      '[aria-label="Side-by-side comparison"]',
    );
    expect(region).not.toBeNull();
    expect(region!.textContent).toContain("https://a.example");
    expect(region!.textContent).toContain("SUPPORTED");
  });
});
