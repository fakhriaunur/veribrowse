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

// VAL-WEB-022: nerd-view timeout presets (Quick/Standard/Thorough set
// #llm-timeout from config/llm.json min/default/max, never hardcoded);
// presets + input render only in the nerd view; untouched sends no param;
// custom raw values submit as-is (server clamps).
describe("Nerd-view timeout presets", () => {
  function presetButton(name: "Quick" | "Standard" | "Thorough") {
    return clickButton(name);
  }

  function timeoutInput(): HTMLInputElement {
    const input = container.querySelector("#llm-timeout");
    if (!(input instanceof HTMLInputElement))
      throw new Error("llm-timeout missing");
    return input;
  }

  it("main view has no preset buttons in any state", async () => {
    renderHome();
    for (const name of ["Quick", "Standard", "Thorough"] as const) {
      const found = Array.from(container.querySelectorAll("button")).some(
        (b) => b.textContent === name,
      );
      expect(found).toBe(false);
    }
    // Still absent after results render in the main view.
    fetchMock.mockResolvedValueOnce(jsonResponse(scoreFixture));
    await act(async () => {
      await clickButton("Score").click();
    });
    expect(container.textContent).toContain("85/100");
    for (const name of ["Quick", "Standard", "Thorough"] as const) {
      const found = Array.from(container.querySelectorAll("button")).some(
        (b) => b.textContent === name,
      );
      expect(found).toBe(false);
    }
    expect(container.querySelector("#llm-timeout")).toBeNull();
  });

  it.each([
    ["Quick", "min"],
    ["Standard", "default"],
    ["Thorough", "max"],
  ] as const)(
    "%s preset sets input.value to String(config timeoutMs.%s)",
    (preset, key) => {
      renderHome();
      enableVerbose();
      act(() => {
        presetButton(preset).click();
      });
      expect(timeoutInput().value).toBe(String(llmConfig.timeoutMs[key]));
    },
  );

  it.each([
    ["Quick", "min"],
    ["Standard", "default"],
    ["Thorough", "max"],
  ] as const)(
    "%s preset drives llmTimeoutMs on Score and Verify requests",
    async (preset, key) => {
      renderHome();
      enableVerbose();
      act(() => {
        presetButton(preset).click();
      });
      const expected = String(llmConfig.timeoutMs[key]);

      fetchMock.mockResolvedValueOnce(jsonResponse(scoreFixture));
      await act(async () => {
        await clickButton("Score").click();
      });
      expect(lastFetchUrl()).toContain(`llmTimeoutMs=${expected}`);

      fetchMock.mockResolvedValueOnce(jsonResponse(checkFixture));
      await act(async () => {
        await clickButton("Verify").click();
      });
      expect(lastFetchUrl()).toContain(`llmTimeoutMs=${expected}`);
    },
  );

  it("untouched input sends no llmTimeoutMs param on either flow", async () => {
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
});

// VAL-WEB-021: nerd-view-only LLM progress timer (live elapsed ticker while
// loading) + post-hoc per-step table from provenance.llmTimings. Main
// (elderly) view never shows timer/table nodes in any state.
describe("Nerd-view LLM progress timer", () => {
  const scoreWithTimings = {
    ...scoreFixture,
    provenance: {
      ...scoreFixture.provenance,
      llmStep: "chat-primary",
      llmTimings: [
        { step: "responses-primary", ms: 120, ok: false },
        { step: "chat-primary", ms: 340, ok: true },
      ],
    },
  } as TrustScore;

  const checkWithTimings = {
    ...checkFixture,
    evidence: [],
    provenance: {
      ...checkFixture.provenance,
      llmStep: "responses-primary",
      llmTimings: [{ step: "responses-primary", ms: 210, ok: true }],
    },
  } as ClaimResult;

  function timerNode(): HTMLElement | null {
    return container.querySelector('[role="timer"]');
  }

  function timingsTable(): HTMLTableElement | null {
    return container.querySelector('table[aria-label="LLM per-step timings"]');
  }

  function tableRows(): string[][] {
    const table = timingsTable();
    if (!table) throw new Error("timings table missing");
    return Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) =>
        (td.textContent ?? "").trim(),
      ),
    );
  }

  it("main view shows no timer or table nodes while loading, on success, or on error", async () => {
    renderHome();
    // Loading (pending fetch, verbose OFF): skeleton only, no timer.
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = (async () => {
        await clickButton("Score").click();
      })();
    });
    expect(
      container.querySelector('[aria-label="Scoring website, please wait"]'),
    ).not.toBeNull();
    expect(timerNode()).toBeNull();
    await act(async () => {
      resolveFetch(jsonResponse(scoreWithTimings));
      await pending;
    });
    // Success in main view: result renders, still no timer and no table.
    expect(container.textContent).toContain("85/100");
    expect(timerNode()).toBeNull();
    expect(timingsTable()).toBeNull();

    // Error in main view: alert renders, still no timer and no table.
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      await clickButton("Verify").click();
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(timerNode()).toBeNull();
    expect(timingsTable()).toBeNull();
  });

  it("timer appears only when verbose && loading, with budget + chain-order expectation", async () => {
    renderHome();
    // Verbose OFF + loading: no timer.
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = (async () => {
        await clickButton("Score").click();
      })();
    });
    expect(timerNode()).toBeNull();
    await act(async () => {
      resolveFetch(jsonResponse(scoreFixture));
      await pending;
    });

    // Verbose ON + loading: timer with elapsed/budget text + expectation.
    let resolveVerify!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveVerify = resolve;
      }),
    );
    enableVerbose();
    let pendingVerify!: Promise<void>;
    act(() => {
      pendingVerify = (async () => {
        await clickButton("Verify").click();
      })();
    });
    const timer = timerNode();
    expect(timer).not.toBeNull();
    expect(timer?.getAttribute("aria-live")).toBe("off");
    expect(timer?.textContent).toMatch(
      /LLM elapsed \d+(\.\d+)?s \/ step budget \d+s/,
    );
    expect(timer?.textContent).toContain("up to 4 steps");
    expect(timer?.textContent).toContain("responses-primary");
    expect(timer?.textContent).toContain("chat-primary");
    await act(async () => {
      resolveVerify(jsonResponse(checkFixture));
      await pendingVerify;
    });
    // Timer unmounts on success.
    expect(timerNode()).toBeNull();
  });

  it("timer ticks at least twice while loading (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      renderHome();
      enableVerbose();
      let resolveFetch!: (r: Response) => void;
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      );
      let pending!: Promise<void>;
      act(() => {
        pending = (async () => {
          await clickButton("Score").click();
        })();
      });
      const sample = () => timerNode()?.textContent ?? "";
      const first = sample();
      expect(first).toMatch(/LLM elapsed/);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      const second = sample();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      const third = sample();
      // At least two distinct elapsed samples observed across three reads.
      expect(new Set([first, second, third]).size).toBeGreaterThanOrEqual(2);
      await act(async () => {
        resolveFetch(jsonResponse(scoreFixture));
        await pending;
      });
      expect(timerNode()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("timer stops on error and no table renders", async () => {
    renderHome();
    enableVerbose();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      await clickButton("Score").click();
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(timerNode()).toBeNull();
    expect(timingsTable()).toBeNull();
  });

  it("post-hoc score table rows deep-equal provenance.llmTimings with the winning row marked", async () => {
    renderHome();
    enableVerbose();
    fetchMock.mockResolvedValueOnce(jsonResponse(scoreWithTimings));
    await act(async () => {
      await clickButton("Score").click();
    });
    expect(timerNode()).toBeNull();
    const rows = tableRows();
    expect(rows).toEqual([
      ["responses-primary", "120 ms", "failed"],
      ["chat-primary ✓", "340 ms", "ok"],
    ]);
    // Winning row equals provenance.llmStep.
    const body = container.querySelector("details pre")?.textContent ?? "";
    expect(body).toContain('"llmStep": "chat-primary"');
  });

  it("post-hoc check table renders from provenance.llmTimings; absent on fallback paths", async () => {
    renderHome();
    enableVerbose();
    fetchMock.mockResolvedValueOnce(jsonResponse(checkWithTimings));
    await act(async () => {
      await clickButton("Verify").click();
    });
    expect(timerNode()).toBeNull();
    expect(tableRows()).toEqual([["responses-primary ✓", "210 ms", "ok"]]);

    // Fallback/no-key path (no llmTimings key): result renders, no table.
    fetchMock.mockResolvedValueOnce(jsonResponse(checkFixture));
    await act(async () => {
      await clickButton("Verify").click();
    });
    expect(timingsTable()).toBeNull();
  });
});
