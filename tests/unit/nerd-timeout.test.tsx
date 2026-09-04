import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Home from "@/app/page";
import llmConfig from "@/config/llm.json";
import type { TrustScore } from "@/lib/score";
import type { ClaimResult } from "@/lib/claim";

// VAL-WEB-020: nerd-view LLM timeout number input (min/max from
// config/llm.json); main elderly view has no timeout control; untouched =
// default (no param sent); raw values submit as-is (server clamps).

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

function jsonResponse(body: unknown, ok = true, status = 200) {
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

function verboseCheckbox(): HTMLInputElement {
  const box = container.querySelector('input[type="checkbox"]');
  if (!(box instanceof HTMLInputElement)) throw new Error("verbose missing");
  return box;
}

function enableVerbose() {
  act(() => {
    verboseCheckbox().click();
  });
}

function clickButton(name: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = buttons.find((b) => b.textContent === name);
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`${name} missing`);
  return button;
}

function lastFetchUrl(): string {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch never called");
  return String(call[0]);
}

describe("Nerd-view LLM timeout control", () => {
  it("main elderly view has no timeout control", async () => {
    renderHome();
    expect(container.querySelector("#llm-timeout")).toBeNull();
    // Still absent after a score result renders in the main view.
    fetchMock.mockResolvedValueOnce(jsonResponse(scoreFixture));
    await act(async () => {
      await clickButton("Score").click();
    });
    expect(container.textContent).toContain("85/100");
    expect(container.querySelector("#llm-timeout")).toBeNull();
  });

  it("nerd view renders a labeled, keyboard-reachable number input with min/max from config", () => {
    renderHome();
    enableVerbose();
    const input = container.querySelector("#llm-timeout");
    expect(input?.getAttribute("type")).toBe("number");
    expect(input?.getAttribute("min")).toBe(String(llmConfig.timeoutMs.min));
    expect(input?.getAttribute("max")).toBe(String(llmConfig.timeoutMs.max));
    expect(input?.getAttribute("placeholder")).toBe(
      String(llmConfig.timeoutMs.default),
    );
    const label = container.querySelector('label[for="llm-timeout"]');
    expect(label?.textContent).toBe("LLM step timeout (ms)");
    // Keyboard-reachable: focusable via .focus().
    (input as HTMLInputElement).focus();
    expect(document.activeElement).toBe(input);
  });

  it("untouched input sends no timeout param (server default applies)", async () => {
    renderHome();
    enableVerbose();
    fetchMock.mockResolvedValueOnce(jsonResponse(scoreFixture));
    await act(async () => {
      await clickButton("Score").click();
    });
    expect(lastFetchUrl()).not.toContain("llmTimeoutMs");

    fetchMock.mockResolvedValueOnce(jsonResponse(checkFixture));
    await act(async () => {
      await clickButton("Verify").click();
    });
    expect(lastFetchUrl()).not.toContain("llmTimeoutMs");
  });

  it("touched input submits its value on score and check (server clamps below-min)", async () => {
    renderHome();
    enableVerbose();
    const input = container.querySelector("#llm-timeout") as HTMLInputElement;
    const belowMin = llmConfig.timeoutMs.min - 500;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeSetter?.call(input, String(belowMin));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe(String(belowMin));

    fetchMock.mockResolvedValueOnce(jsonResponse(scoreFixture));
    await act(async () => {
      await clickButton("Score").click();
    });
    // Raw below-min value is submitted; the server clamps it to min.
    expect(lastFetchUrl()).toContain(`llmTimeoutMs=${belowMin}`);

    fetchMock.mockResolvedValueOnce(jsonResponse(checkFixture));
    await act(async () => {
      await clickButton("Verify").click();
    });
    expect(lastFetchUrl()).toContain(`llmTimeoutMs=${belowMin}`);
  });
});
