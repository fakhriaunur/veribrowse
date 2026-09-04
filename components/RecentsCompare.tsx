"use client";

import { useState } from "react";
import { TrustBadge } from "./TrustBadge";
import { RECENTS_MAX, type RecentEntry } from "@/lib/recents";

function ScoreCard({
  entry,
}: {
  entry: Extract<RecentEntry, { kind: "score" }>;
}) {
  return (
    <div className="rounded-lg border p-4">
      <TrustBadge trust={entry.trust} level={entry.level} />
      <p className="mt-2 break-all text-sm font-medium">{entry.url}</p>
      <p className="mt-1 text-sm text-zinc-600">{entry.summary}</p>
    </div>
  );
}

function CheckCard({
  entry,
}: {
  entry: Extract<RecentEntry, { kind: "check" }>;
}) {
  const color =
    entry.verdict === "supported"
      ? "bg-green-600"
      : entry.verdict === "contradicted"
        ? "bg-red-600"
        : "bg-yellow-500";
  return (
    <div className="rounded-lg border p-4">
      <div
        className={`inline-flex rounded-full px-3 py-1 text-sm font-bold text-white ${color}`}
      >
        {entry.verdict.toUpperCase()} {(entry.confidence * 100).toFixed(0)}%
      </div>
      <p className="mt-2 text-sm font-medium">“{entry.claim}”</p>
      <p className="mt-1 text-sm text-zinc-600">{entry.summary}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {entry.evidenceCount} evidence source
        {entry.evidenceCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function EntryCard({ entry }: { entry: RecentEntry }) {
  return entry.kind === "score" ? (
    <ScoreCard entry={entry} />
  ) : (
    <CheckCard entry={entry} />
  );
}

export function RecentsCompare({
  recents,
  onClear,
  onRemove,
}: {
  recents: RecentEntry[];
  onClear: () => void;
  onRemove: (id: string) => void;
}) {
  const [firstId, setFirstId] = useState<string>("");
  const [secondId, setSecondId] = useState<string>("");

  const first = recents.find((e) => e.id === firstId) ?? null;
  const second = recents.find((e) => e.id === secondId) ?? null;

  const labelOf = (e: RecentEntry) =>
    e.kind === "score"
      ? `Score ${e.trust}/100 ${e.url.slice(0, 40)}`
      : `${e.verdict} “${e.claim.slice(0, 40)}”`;

  const selectClass =
    "w-full rounded border px-3 py-2 text-sm bg-white text-zinc-900";

  return (
    <section
      aria-label="Recent results and compare"
      className="mt-6 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">🕘 Recent results</h2>
        {recents.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear recent results"
            className="rounded border px-3 py-2 text-sm hover:bg-zinc-100"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Stored only in this browser (up to {RECENTS_MAX}). Summaries only — no
        page content or keys. Clearing removes them from this device.
      </p>

      {recents.length === 0 ? (
        <p className="mt-3 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
          No recent results yet — score a website or check a claim above and it
          will appear here. Compare two results side by side once you have at
          least two.
        </p>
      ) : (
        <>
          <ul className="mt-3 grid gap-2">
            {recents.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {e.kind === "score"
                    ? `🛡️ ${e.trust}/100 ${e.level} — ${e.url}`
                    : `🔍 ${e.verdict} ${(e.confidence * 100).toFixed(0)}% — ${e.claim.slice(0, 60)}`}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(e.id)}
                  aria-label={`Remove recent ${labelOf(e)}`}
                  className="rounded border px-2 py-1 text-xs hover:bg-white"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          {recents.length >= 2 && (
            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-semibold">Compare two results</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor="compare-a" className="text-xs font-medium">
                    First result
                  </label>
                  <select
                    id="compare-a"
                    value={firstId}
                    onChange={(e) => setFirstId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select…</option>
                    {recents.map((e) => (
                      <option key={e.id} value={e.id}>
                        {labelOf(e)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="compare-b" className="text-xs font-medium">
                    Second result
                  </label>
                  <select
                    id="compare-b"
                    value={secondId}
                    onChange={(e) => setSecondId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select…</option>
                    {recents.map((e) => (
                      <option key={e.id} value={e.id}>
                        {labelOf(e)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {first && second && (
                <div
                  role="region"
                  aria-label="Side-by-side comparison"
                  className="mt-3 grid gap-3 md:grid-cols-2"
                >
                  <EntryCard entry={first} />
                  <EntryCard entry={second} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
