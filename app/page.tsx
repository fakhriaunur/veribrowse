"use client";

import { useEffect, useState } from "react";
import { TrustBadge } from "@/components/TrustBadge";
import type { TrustScore } from "@/lib/score";
import type { ClaimResult } from "@/lib/claim";

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

  const appendLog = (msg: string) =>
    setLog((l) => [
      ...l.slice(-8),
      `${new Date().toLocaleTimeString()} ${msg}`,
    ]);

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
    const res = await fetch(`/api/score?url=${encodeURIComponent(url)}`);
    const data = (await res.json()) as TrustScore;
    setScore(data);
    appendLog(`Manual score ${url} -> ${data.level}`);
  };

  const onCheck = async () => {
    const qs = new URLSearchParams({ claim });
    if (contextUrl) qs.set("contextUrl", contextUrl);
    const res = await fetch(`/api/check?${qs.toString()}`);
    const data = (await res.json()) as ClaimResult;
    setClaimResult(data);
    appendLog(`Manual check -> ${data.verdict}`);
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">VeriBrowse</h1>
        <p className="mt-2 text-zinc-600">
          Score any website and verify claims — friendly for elders, audit-ready
          for nerds. Works with your AI via WebMCP.
        </p>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="rounded bg-zinc-100 px-2 py-1">
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
      </header>

      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">🛡️ Score a website</h2>
        <p className="text-sm text-zinc-600">
          Agent will call <code>scoreWebsite(url)</code> automatically. Try it
          manually:
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            onClick={onScore}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
          >
            Score
          </button>
        </div>
        {score && (
          <div className="mt-4 rounded-lg bg-zinc-50 p-4">
            <TrustBadge trust={score.trust} level={score.level} />
            <p className="mt-3 text-lg font-medium leading-snug">
              {score.elderlySummary}
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
              {score.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            {verbose && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Nerd audit
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-white p-3 text-xs">
                  {JSON.stringify(score, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">🔍 Check a claim</h2>
        <p className="text-sm text-zinc-600">
          Agent will call <code>checkClaim(claim, contextUrl)</code>.
          Fail-closed when no evidence.
        </p>
        <div className="mt-3 grid gap-2">
          <input
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="Claim text"
            className="rounded border px-3 py-2 text-sm"
          />
          <input
            value={contextUrl}
            onChange={(e) => setContextUrl(e.target.value)}
            placeholder="Evidence URL (optional)"
            className="rounded border px-3 py-2 text-sm"
          />
          <button
            onClick={onCheck}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
          >
            Verify
          </button>
        </div>
        {claimResult && (
          <div className="mt-4 rounded-lg bg-zinc-50 p-4">
            <div
              className={`inline-flex rounded-full px-3 py-1 text-sm font-bold text-white ${claimResult.verdict === "supported" ? "bg-green-600" : claimResult.verdict === "contradicted" ? "bg-red-600" : "bg-yellow-500"}`}
            >
              {claimResult.verdict.toUpperCase()}{" "}
              {(claimResult.confidence * 100).toFixed(0)}%
            </div>
            <p className="mt-2 text-lg font-medium">
              {claimResult.elderlySummary}
            </p>
            <p className="mt-1 text-sm text-zinc-700">
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
                <pre className="mt-2 overflow-auto rounded bg-white p-3 text-xs">
                  {JSON.stringify(claimResult, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border bg-zinc-50 p-4">
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
          <p className="mt-2 text-sm text-zinc-600">
            No tools discovered yet. In ChatGPT in-app browser or Chrome with{" "}
            <code>chrome://flags#webmcp</code> enabled,
            <code> document.modelContext.getTools()</code> will list{" "}
            <code>ping</code>, <code>echoEcho</code>, <code>scoreWebsite</code>,{" "}
            <code>checkClaim</code>.
          </p>
        )}
        <div className="mt-3 text-xs text-zinc-500">
          <div>
            Sources: Burnes 2017 (1 in 18/yr), Yu 2023 (16.4% impersonation
            engage), APJII 77% penetration / 51.7% seniors.
          </div>
        </div>
      </section>

      <section className="mt-6 rounded border p-3">
        <h3 className="text-sm font-semibold">Activity log (for QA)</h3>
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-white p-2 text-xs">
          {log.join("\n") || "(idle)"}
        </pre>
      </section>

      <footer className="mt-8 text-center text-xs text-zinc-500">
        VeriBrowse v0.1.0 — WebMCP tracer. Provenance: contentHash + retrievedAt
        on every response. Fail-closed on unknown.
      </footer>
    </main>
  );
}
