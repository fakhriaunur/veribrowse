import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Home from "@/app/page";
import type { TrustScore } from "@/lib/score";
import type { ClaimResult } from "@/lib/claim";

// VAL-WEB-018: Score/Check panels show empty state before the first run,
// a loading state during fetch, the result on success, and an error state
// on failure. Manual controls keep visible labels.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const scoreFixture: TrustScore = {
  trust: 85,
  level: "safe",
  elderlySummary: "✅ Score 85/100 — SAFE. This site looks safe to browse.",
  bullets: ["Standard signals — verify via second source"],
  why: "Standard signals",
  provenance: {
    url: "https://example.com",
    contentHash: "deadbeef",
    retrievedAt: "2026-09-04T00:00:00.000Z",
  },
  citations: [{ url: "https://example.com", snippet: "Example" }],
  raw: {
    url: "https://example.com",
    contentHash: "deadbeef",
    retrievedAt: "2026-09-04T00:00:00.000Z",
    hasHttps: true,
  },
};

const checkFixture: ClaimResult = {
  verdict: "unverified",
  confidence: 0.3,
  elderlySummary: "⚠️ Not enough evidence to verify this claim.",
  reasoning: "No evidence retrieved — fail-closed.",
  evidence: [],
  provenance: {
    claim: "The site sells products at 90% off limited time only",
    claimHash: "0123456789abcdef",
    checkedAt: "2026-09-04T00:00:00.000Z",
  },
};

function jsonResponse(body: unknown, ok: boolean, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderHome() {
  act(() => {
    root.render(<Home />);
  });
}

function clickButton(name: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = buttons.find((b) => b.textContent === name);
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`${name} missing`);
  return button;
}

describe("Home loading/error/empty states", () => {
  it("shows empty states with labeled manual controls before the first run", () => {
    renderHome();
    expect(container.textContent).toContain(
      "No score yet — enter a website URL above and press Score.",
    );
    expect(container.textContent).toContain(
      "No verification yet — enter a claim above and press Verify.",
    );
    const urlLabel = container.querySelector('label[for="score-url"]');
    const claimLabel = container.querySelector('label[for="claim-text"]');
    const evidenceLabel = container.querySelector('label[for="evidence-url"]');
    expect(urlLabel?.textContent).toBe("Website URL");
    expect(claimLabel?.textContent).toBe("Claim text");
    expect(evidenceLabel?.textContent).toBe("Evidence URL (optional)");
    // Theme toggle is labeled and keyboard-reachable.
    const toggle = container.querySelector('button[aria-label*="theme"]');
    expect(toggle?.tagName).toBe("BUTTON");
  });

  it("shows a loading state then the score result", async () => {
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderHome();
    const score = clickButton("Score");
    let pending!: Promise<void>;
    act(() => {
      pending = (async () => {
        await score.click();
      })();
    });
    expect(
      container.querySelector('[aria-label="Scoring website, please wait"]'),
    ).not.toBeNull();
    await act(async () => {
      resolveFetch(jsonResponse(scoreFixture, true));
      await pending;
    });
    expect(container.textContent).toContain("SAFE");
    expect(container.textContent).toContain("85/100");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows an error state when scoring fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Missing url" }, false, 400),
    );
    renderHome();
    await act(async () => {
      await clickButton("Score").click();
    });
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("Missing url");
  });

  it("shows a loading state then the verify result, and an error on failure", async () => {
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderHome();
    const verify = clickButton("Verify");
    let pending!: Promise<void>;
    act(() => {
      pending = (async () => {
        await verify.click();
      })();
    });
    expect(
      container.querySelector('[aria-label="Verifying claim, please wait"]'),
    ).not.toBeNull();
    await act(async () => {
      resolveFetch(jsonResponse(checkFixture, true));
      await pending;
    });
    expect(container.textContent).toContain("UNVERIFIED");
    expect(container.textContent).toContain("30%");

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      await clickButton("Verify").click();
    });
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("network down");
  });
});
