"use client";

import { useEffect, useState } from "react";
import { TrustBadge } from "@/components/TrustBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RecentsCompare } from "@/components/RecentsCompare";
import {
  addRecent,
  clearRecents as clearRecentsStore,
  fromClaimResult,
  fromTrustScore,
  loadRecents,
  persistRecents,
  type RecentEntry,
} from "@/lib/recents";
import type { TrustScore } from "@/lib/score";
import type { ClaimResult } from "@/lib/claim";
import llmTimeoutConfig from "@/config/llm.json";

// Nerd-view LLM step-timeout bounds (VAL-WEB-020): rendered as the number
// input's min/max attributes. The server (`lib/llm.ts` resolveStepTimeout,
// wired in both routes) clamps any submitted value into this range and
// applies the default when the input is left untouched.
const LLM_TIMEOUT_MIN_MS = llmTimeoutConfig.timeoutMs.min;
const LLM_TIMEOUT_MAX_MS = llmTimeoutConfig.timeoutMs.max;
const LLM_TIMEOUT_DEFAULT_MS = llmTimeoutConfig.timeoutMs.default;

// Extend global for WebMCP
declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: unknown, opts?: unknown) => Promise<void>;
      getTools?: () => Promise<unknown[]>;
      executeTool?: (tool: unknown, input?: unknown) => Promise<string>;
    };
  }
}

type ToolDef = { name: string; description: string; inputSchema: unknown };

export default function Home() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [score, setScore] = useState<TrustScore | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [url, setUrl] = useState("https://example.com");
  const [claim, setClaim] = useState(
    "The site sells products at 90% off limited time only",
  );
  const [contextUrl, setContextUrl] = useState("");
  const [verbose, setVerbose] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  // Nerd-view only LLM step timeout (ms, raw string). Empty = untouched =
  // omit the param so the server applies its configured default. A raw
  // out-of-range value is submitted as-is; the server clamps into [min,max].
  const [llmTimeoutMs, setLlmTimeoutMs] = useState("");

  // Append the nerd timeout param only when the input was touched, so
  // untouched requests stay byte-identical (server default applies).
  const timeoutQuery = () => {
    const t = llmTimeoutMs.trim();
    return t ? `&llmTimeoutMs=${encodeURIComponent(t)}` : "";
  };

  const appendLog = (msg: string) =>
    setLog((l) => [
      ...l.slice(-8),
      `${new Date().toLocaleTimeString()} ${msg}`,
    ]);

  // Client-only recents: localStorage is the source of truth so WebMCP
  // execute closures never go stale; summaries only, bounded, clearable.
  const recordEntry = (entry: RecentEntry | null) => {
    if (!entry) return;
    const next = addRecent(loadRecents(), entry);
    persistRecents(next);
    setRecents(next);
  };

  const handleClearRecents = () => {
    clearRecentsStore();
    setRecents([]);
  };

  const handleRemoveRecent = (id: string) => {
    const next = loadRecents().filter((e) => e.id !== id);
    persistRecents(next);
    setRecents(next);
  };

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function register() {
      const mc =
        typeof document !== "undefined" ? document.modelContext : undefined;
      if (!mc || typeof mc.registerTool !== "function") {
        appendLog(
          "WebMCP not available — running in browser without flag (expected outside ChatGPT/Chrome 149)",
        );
        return;
      }
      try {
        // Hello-tool tracer (spec M1) — kept alongside prod tools
        await mc.registerTool({
          name: "ping",
          description: "Tracer bullet ping — returns pong for smoke test",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async () => ({ pong: true, at: new Date().toISOString() }),
        } as unknown as Record<string, unknown>);
        appendLog("Registered ping");

        await mc.registerTool({
          name: "echoEcho",
          description: "Tracer echo — returns the input text",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string", description: "Text to echo" },
            },
            required: ["text"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: unknown) => {
            const t = (input as { text?: string })?.text ?? "";
            appendLog(`echoEcho called: ${t}`);
            return { echo: t };
          },
        } as unknown as Record<string, unknown>);
        appendLog("Registered echoEcho");

        // Prod tool: scoreWebsite
        await mc.registerTool({
          name: "scoreWebsite",
          description:
            "Score a website for scam/trust. Returns elderly-friendly summary plus nerd audit with provenance. Use for any URL the user asks about.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "URL to score",
                format: "uri",
              },
            },
            required: ["url"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: unknown, ctx?: { signal?: AbortSignal }) => {
            const u = (input as { url?: string })?.url;
            if (!u) throw new Error("Missing url");
            const res = await fetch(`/api/score?url=${encodeURIComponent(u)}`, {
              signal: ctx?.signal,
            });
            const data = await res.json();
            setScore(data as TrustScore);
            recordEntry(fromTrustScore(data as TrustScore));
            appendLog(`scoreWebsite(${u}) -> ${data.level} ${data.trust}`);
            return data;
          },
        } as unknown as Record<string, unknown>);
        appendLog("Registered scoreWebsite");

        // Prod tool: checkClaim
        await mc.registerTool({
          name: "checkClaim",
          description:
            "Verify a claim against evidence URL. Returns verdict (supported/contradicted/unverified) with citations. Fail-closed when no evidence.",
          inputSchema: {
            type: "object",
            properties: {
              claim: {
                type: "string",
                description: "Claim text to verify",
                minLength: 8,
              },
              contextUrl: {
                type: "string",
                description: "Optional evidence URL",
                format: "uri",
              },
            },
            required: ["claim"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: unknown, ctx?: { signal?: AbortSignal }) => {
            const c = (input as { claim?: string; contextUrl?: string }) ?? {};
            if (!c.claim) throw new Error("Missing claim");
            const qs = new URLSearchParams({ claim: c.claim });
            if (c.contextUrl) qs.set("contextUrl", c.contextUrl);
            const res = await fetch(`/api/check?${qs.toString()}`, {
              signal: ctx?.signal,
            });
            const data = await res.json();
            setClaimResult(data as ClaimResult);
            recordEntry(fromClaimResult(data as ClaimResult));
            appendLog(
              `checkClaim("${c.claim.slice(0, 30)}...") -> ${data.verdict}`,
            );
            return data;
          },
        } as unknown as Record<string, unknown>);
        appendLog("Registered checkClaim");

        if (!cancelled && mc.getTools) {
          const discovered = (await mc.getTools()) as ToolDef[];
          setTools(discovered);
          appendLog(`Discovered ${discovered.length} tools`);
        }
      } catch (e) {
        appendLog(`Register failed: ${String(e)}`);
      }
    }
    register();
    return () => {
      cancelled = true;
    };
  }, []);

  const onScore = async () => {
    setScoreLoading(true);
    setScoreError(null);
    try {
      const res = await fetch(
        `/api/score?url=${encodeURIComponent(url)}${timeoutQuery()}`,
      );
      const data = (await res.json()) as TrustScore & { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? `Score failed (${res.status})`);
      setScore(data);
      recordEntry(fromTrustScore(data));
      appendLog(`Manual score ${url} -> ${data.level}`);
    } catch (e) {
      setScore(null);
      setScoreError(e instanceof Error ? e.message : "Score failed");
      appendLog(`Manual score ${url} -> error`);
    } finally {
      setScoreLoading(false);
    }
  };

  const onCheck = async () => {
    setCheckLoading(true);
    setCheckError(null);
    try {
      const qs = new URLSearchParams({ claim });
      if (contextUrl) qs.set("contextUrl", contextUrl);
      const t = llmTimeoutMs.trim();
      if (t) qs.set("llmTimeoutMs", t);
      const res = await fetch(`/api/check?${qs.toString()}`);
      const data = (await res.json()) as ClaimResult & { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? `Verify failed (${res.status})`);
      setClaimResult(data);
      recordEntry(fromClaimResult(data));
      appendLog(`Manual check -> ${data.verdict}`);
    } catch (e) {
      setClaimResult(null);
      setCheckError(e instanceof Error ? e.message : "Verify failed");
      appendLog(`Manual check -> error`);
    } finally {
      setCheckLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">VeriBrowse</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Score any website and verify claims — friendly for elders,
              audit-ready for nerds. Works with your AI via WebMCP.
            </p>
          </div>
          <ThemeToggle />
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="rounded bg-zinc-100 px-2 py-1 dark:bg-seam dark:text-zinc-200">
            WebMCP:{" "}
            {tools.length
              ? `${tools.length} tools`
              : "not detected (enable flag or use ChatGPT browser)"}
          </span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={verbose}
              onChange={(e) => setVerbose(e.target.checked)}
            />
            Nerd verbose
          </label>
        </div>
        {verbose && (
          <div className="mt-3 flex max-w-xs flex-col gap-1 text-sm">
            <label htmlFor="llm-timeout" className="text-xs font-medium">
              LLM step timeout (ms)
            </label>
            <input
              id="llm-timeout"
              type="number"
              inputMode="numeric"
              min={LLM_TIMEOUT_MIN_MS}
              max={LLM_TIMEOUT_MAX_MS}
              placeholder={String(LLM_TIMEOUT_DEFAULT_MS)}
              value={llmTimeoutMs}
              onChange={(e) => setLlmTimeoutMs(e.target.value)}
              aria-describedby="llm-timeout-help"
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-seam dark:bg-abyss dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <p
              id="llm-timeout-help"
              className="text-xs text-zinc-500 dark:text-zinc-400"
            >
              Nerds only: per-step LLM budget {LLM_TIMEOUT_MIN_MS}–
              {LLM_TIMEOUT_MAX_MS} ms (default {LLM_TIMEOUT_DEFAULT_MS} when
              empty). Out-of-range values are clamped server-side.
            </p>
          </div>
        )}
      </header>

      <section
        aria-label="Score a website"
        aria-busy={scoreLoading}
        className="rounded-xl border border-zinc-200 p-4 dark:border-seam"
      >
        <h2 className="text-lg font-semibold">🛡️ Score a website</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Agent will call <code>scoreWebsite(url)</code> automatically. Try it
          manually:
        </p>
        <div className="mt-3 flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="score-url" className="text-xs font-medium">
              Website URL
            </label>
            <input
              id="score-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-seam dark:bg-abyss dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <button
            onClick={onScore}
            disabled={scoreLoading}
            className="self-end rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-menta dark:text-ink dark:hover:bg-menta-deep"
          >
            Score
          </button>
        </div>
        {!score && !scoreLoading && !scoreError && (
          <p className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-abyss dark:text-zinc-400">
            No score yet — enter a website URL above and press Score.
          </p>
        )}
        {scoreLoading && (
          <div
            role="status"
            aria-label="Scoring website, please wait"
            className="mt-4 animate-pulse rounded-lg bg-zinc-50 p-4 dark:bg-abyss"
          >
            <div className="h-8 w-40 rounded-full bg-zinc-200 dark:bg-seam" />
            <div className="mt-3 h-5 w-3/4 rounded bg-zinc-200 dark:bg-seam" />
            <div className="mt-2 h-4 w-1/2 rounded bg-zinc-200 dark:bg-seam" />
          </div>
        )}
        {scoreError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-ink dark:text-red-300"
          >
            Score failed: {scoreError}. Check the URL and try again.
          </div>
        )}
        {score && !scoreLoading && (
          <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-abyss">
            <TrustBadge trust={score.trust} level={score.level} />
            <p className="mt-3 text-lg font-medium leading-snug">
              {score.elderlySummary}
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {score.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            {verbose && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Nerd audit
                </summary>
                <pre className="mt-2 overflow-auto rounded border border-zinc-200 bg-white p-3 text-xs dark:border-seam dark:bg-ink dark:text-zinc-200">
                  {JSON.stringify(score, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>

      <section
        aria-label="Check a claim"
        aria-busy={checkLoading}
        className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-seam"
      >
        <h2 className="text-lg font-semibold">🔍 Check a claim</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Agent will call <code>checkClaim(claim, contextUrl)</code>.
          Fail-closed when no evidence.
        </p>
        <div className="mt-3 grid gap-2">
          <div className="grid gap-1">
            <label htmlFor="claim-text" className="text-xs font-medium">
              Claim text
            </label>
            <input
              id="claim-text"
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="Claim text"
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-seam dark:bg-abyss dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="evidence-url" className="text-xs font-medium">
              Evidence URL (optional)
            </label>
            <input
              id="evidence-url"
              value={contextUrl}
              onChange={(e) => setContextUrl(e.target.value)}
              placeholder="Evidence URL (optional)"
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-seam dark:bg-abyss dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <button
            onClick={onCheck}
            disabled={checkLoading}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-menta dark:text-ink dark:hover:bg-menta-deep"
          >
            Verify
          </button>
        </div>
        {!claimResult && !checkLoading && !checkError && (
          <p className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-abyss dark:text-zinc-400">
            No verification yet — enter a claim above and press Verify.
          </p>
        )}
        {checkLoading && (
          <div
            role="status"
            aria-label="Verifying claim, please wait"
            className="mt-4 animate-pulse rounded-lg bg-zinc-50 p-4 dark:bg-abyss"
          >
            <div className="h-7 w-44 rounded-full bg-zinc-200 dark:bg-seam" />
            <div className="mt-3 h-5 w-2/3 rounded bg-zinc-200 dark:bg-seam" />
          </div>
        )}
        {checkError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-ink dark:text-red-300"
          >
            Verify failed: {checkError}. Check the claim text and try again.
          </div>
        )}
        {claimResult && !checkLoading && (
          <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-abyss">
            <div
              role="status"
              aria-label={`Claim verdict ${claimResult.verdict}, confidence ${(claimResult.confidence * 100).toFixed(0)} percent`}
              className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${claimResult.verdict === "supported" ? "bg-green-600 text-white" : claimResult.verdict === "contradicted" ? "bg-red-600 text-white" : "bg-yellow-500 text-zinc-950"}`}
            >
              <span aria-hidden="true">
                {claimResult.verdict.toUpperCase()}{" "}
                {(claimResult.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-2 text-lg font-medium">
              {claimResult.elderlySummary}
            </p>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {claimResult.reasoning}
            </p>
            {claimResult.evidence.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {claimResult.evidence.map((e, i) => (
                  <li key={i}>
                    <a
                      href={e.url}
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {e.url}
                    </a>{" "}
                    — “{e.quote.slice(0, 120)}”
                    {e.badge && (
                      <span className="mt-1 block w-fit scale-90">
                        <TrustBadge
                          trust={e.badge.trust}
                          level={e.badge.level}
                        />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {verbose && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Nerd audit
                </summary>
                <pre className="mt-2 overflow-auto rounded border border-zinc-200 bg-white p-3 text-xs dark:border-seam dark:bg-ink dark:text-zinc-200">
                  {JSON.stringify(claimResult, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>

      <RecentsCompare
        recents={recents}
        onClear={handleClearRecents}
        onRemove={handleRemoveRecent}
      />

      <section className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-seam dark:bg-abyss">
        <h3 className="text-sm font-semibold">WebMCP tools (for agent & QA)</h3>
        {tools.length ? (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {tools.map((t) => (
              <li key={t.name}>
                <code className="font-mono text-xs">{t.name}</code> —{" "}
                {t.description}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No tools discovered yet. In ChatGPT in-app browser or Chrome with{" "}
            <code>chrome://flags#webmcp</code> enabled,
            <code> document.modelContext.getTools()</code> will list{" "}
            <code>ping</code>, <code>echoEcho</code>, <code>scoreWebsite</code>,{" "}
            <code>checkClaim</code>.
          </p>
        )}
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <div>
            Sources: Burnes 2017 (1 in 18/yr), Yu 2023 (16.4% impersonation
            engage), APJII 77% penetration / 51.7% seniors.
          </div>
        </div>
      </section>

      <section className="mt-6 rounded border border-zinc-200 p-3 dark:border-seam">
        <h3 className="text-sm font-semibold">Activity log (for QA)</h3>
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-zinc-200 bg-white p-2 text-xs dark:border-seam dark:bg-ink dark:text-zinc-200">
          {log.join("\n") || "(idle)"}
        </pre>
      </section>

      <footer className="mt-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
        VeriBrowse v0.1.0 — WebMCP tracer. Provenance: contentHash + retrievedAt
        on every response. Fail-closed on unknown.
      </footer>
    </main>
  );
}
