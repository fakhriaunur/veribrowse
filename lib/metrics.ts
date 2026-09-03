/**
 * In-memory counters for observability — stateless stub suitable for Netlify.
 * Counters reset on restart. Used by /api/metrics and logged on fallback.
 */

type Counters = {
  score_requests_total: number;
  check_requests_total: number;
  openai_fallback_total: number;
  http_requests_total: number;
};

function freshCounters(): Counters {
  return {
    score_requests_total: 0,
    check_requests_total: 0,
    openai_fallback_total: 0,
    http_requests_total: 0,
  };
}

// Process-wide singleton via globalThis: Next.js may evaluate this module
// once per route bundle (dev on-demand entries and per-route server chunks),
// so a module-local object would split counts. globalThis keeps one set.
const store = globalThis as unknown as {
  __veribrowse_counters?: Counters;
};
if (!store.__veribrowse_counters) {
  store.__veribrowse_counters = freshCounters();
}
const counters: Counters = store.__veribrowse_counters;

export function inc(name: keyof Counters, value = 1): void {
  counters[name] += value;
}

export function getCounters(): Readonly<Counters> {
  return { ...counters };
}

export function resetForTest(): void {
  const fresh = freshCounters();
  counters.score_requests_total = fresh.score_requests_total;
  counters.check_requests_total = fresh.check_requests_total;
  counters.openai_fallback_total = fresh.openai_fallback_total;
  counters.http_requests_total = fresh.http_requests_total;
}

export function toPrometheus(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(counters)) {
    lines.push(`# HELP ${k} ${k}`);
    lines.push(`# TYPE ${k} counter`);
    lines.push(`${k} ${v}`);
  }
  return lines.join("\n") + "\n";
}
