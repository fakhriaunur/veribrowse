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

const counters: Counters = {
  score_requests_total: 0,
  check_requests_total: 0,
  openai_fallback_total: 0,
  http_requests_total: 0,
};

export function inc(name: keyof Counters, value = 1): void {
  counters[name] += value;
}

export function getCounters(): Readonly<Counters> {
  return { ...counters };
}

export function resetForTest(): void {
  counters.score_requests_total = 0;
  counters.check_requests_total = 0;
  counters.openai_fallback_total = 0;
  counters.http_requests_total = 0;
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
