import { describe, it, expect, beforeEach } from "vitest";
import { inc, getCounters, resetForTest, toPrometheus } from "@/lib/metrics";

beforeEach(() => {
  resetForTest();
});

describe("metrics counters", () => {
  it("starts at zero after reset", () => {
    const c = getCounters();
    expect(c.score_requests_total).toBe(0);
    expect(c.check_requests_total).toBe(0);
    expect(c.openai_fallback_total).toBe(0);
  });

  it("increments score_requests_total per score request", () => {
    inc("score_requests_total");
    inc("score_requests_total");
    expect(getCounters().score_requests_total).toBe(2);
    expect(getCounters().check_requests_total).toBe(0);
  });

  it("increments check_requests_total per check request", () => {
    inc("check_requests_total");
    expect(getCounters().check_requests_total).toBe(1);
    expect(getCounters().score_requests_total).toBe(0);
  });

  it("increments openai_fallback_total on OpenAI fallback", () => {
    inc("openai_fallback_total");
    expect(getCounters().openai_fallback_total).toBe(1);
  });

  it("getCounters returns a copy that cannot mutate state", () => {
    const c = getCounters();
    (c as { score_requests_total: number }).score_requests_total = 99;
    expect(getCounters().score_requests_total).toBe(0);
  });

  it("reset only happens on restart (explicit resetForTest)", () => {
    inc("score_requests_total");
    inc("check_requests_total");
    inc("openai_fallback_total");
    // Counters persist across reads without reset.
    expect(getCounters().score_requests_total).toBe(1);
    resetForTest();
    expect(getCounters().score_requests_total).toBe(0);
    expect(getCounters().check_requests_total).toBe(0);
    expect(getCounters().openai_fallback_total).toBe(0);
  });
});

describe("metrics Prometheus exposition", () => {
  it("renders HELP/TYPE/counter lines for every counter", () => {
    inc("score_requests_total");
    inc("score_requests_total");
    inc("score_requests_total");
    inc("check_requests_total");
    inc("openai_fallback_total");
    const body = toPrometheus();
    expect(body).toContain("# HELP score_requests_total");
    expect(body).toContain("# TYPE score_requests_total counter");
    expect(body).toContain("score_requests_total 3");
    expect(body).toContain("# HELP check_requests_total");
    expect(body).toContain("# TYPE check_requests_total counter");
    expect(body).toContain("check_requests_total 1");
    expect(body).toContain("# HELP openai_fallback_total");
    expect(body).toContain("# TYPE openai_fallback_total counter");
    expect(body).toContain("openai_fallback_total 1");
  });

  it("diff increments after simulated score/check traffic", () => {
    const before = toPrometheus();
    expect(before).toContain("score_requests_total 0");
    inc("score_requests_total");
    inc("check_requests_total");
    const after = toPrometheus();
    expect(after).toContain("score_requests_total 1");
    expect(after).toContain("check_requests_total 1");
    expect(after).not.toBe(before);
  });
});
