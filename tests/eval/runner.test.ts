import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseArgs,
  validateDataset,
  buildScoreUrl,
  runDataset,
  main,
} from "../../scripts/eval/run.mjs";
import type { FetchFn } from "../../scripts/eval/run.mjs";

const EVAL_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "eval",
);

function sampleRows() {
  return [
    {
      url: "https://example.com/a",
      expected_tier: "safe",
      auditor_source: "synthetic",
      citation: "synthetic",
    },
    {
      url: "https://example.org/b",
      expected_tier: "caution",
      auditor_source: "synthetic",
      citation: "synthetic",
    },
    {
      url: "https://example.net/c",
      expected_tier: "risky",
      auditor_source: "synthetic",
      citation: "synthetic",
    },
  ];
}

function fixtureFetch(trust = 42, level = "caution"): FetchFn {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      trust,
      level,
      provenance: {
        contentHash: "abcd1234",
        retrievedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
  }));
}

describe("parseArgs", () => {
  it("defaults to fixture dry-run with pinned budget flags", () => {
    const args = parseArgs(["node", "run.mjs"]);
    expect(args.fixture).toBe(true);
    expect(args.model).toBe("gpt-4o-mini");
    expect(args.maxRequests).toBe(120);
    expect(args.sleepMs).toBe(250);
  });

  it("rejects unknown flags and invalid budgets", () => {
    expect(() => parseArgs(["node", "run.mjs", "--bogus"])).toThrow(
      /Unknown arg/,
    );
    expect(() => parseArgs(["node", "run.mjs", "--max-requests=0"])).toThrow(
      /max-requests/,
    );
    expect(() => parseArgs(["node", "run.mjs", "--sleep-ms=-1"])).toThrow(
      /sleep-ms/,
    );
  });
});

describe("validateDataset", () => {
  it("accepts well-formed rows", () => {
    const { rows, errors } = validateDataset({
      name: "t",
      version: "1",
      rows: sampleRows(),
    });
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
  });

  it("reports every schema violation with row index", () => {
    const { rows, errors } = validateDataset({
      rows: [
        {
          url: "not-a-url",
          expected_tier: "bogus",
          auditor_source: "",
          citation: "",
        },
        "nope",
      ],
    });
    expect(rows).toEqual([]);
    expect(errors.join("\n")).toMatch(/rows\[0\]\.url/);
    expect(errors.join("\n")).toMatch(/rows\[0\]\.expected_tier/);
    expect(errors.join("\n")).toMatch(/rows\[0\]\.auditor_source/);
    expect(errors.join("\n")).toMatch(/rows\[1\]/);
  });

  it("rejects non-object roots and missing rows", () => {
    expect(validateDataset(null).errors.length).toBeGreaterThan(0);
    expect(validateDataset({ rows: "x" }).errors.length).toBeGreaterThan(0);
  });
});

describe("buildScoreUrl", () => {
  it("pins fixture=1 in dry-run mode", () => {
    const url = buildScoreUrl(
      "http://127.0.0.1:3000",
      "https://example.com/a",
      {
        fixture: true,
        timeoutMs: 10000,
      },
    );
    expect(url).toContain("fixture=1");
    expect(url).not.toContain("llmTimeoutMs");
  });

  it("pins llmTimeoutMs in keyed mode", () => {
    const url = buildScoreUrl(
      "http://127.0.0.1:3000",
      "https://example.com/a",
      {
        fixture: false,
        timeoutMs: 10000,
      },
    );
    expect(url).toContain("llmTimeoutMs=10000");
    expect(url).not.toContain("fixture=1");
  });
});

describe("runDataset dry-run determinism and $0 proof", () => {
  it("every request carries fixture=1 and no auth header", async () => {
    const fetchFn = fixtureFetch();
    const { records, stats } = await runDataset({
      rows: sampleRows(),
      baseUrl: "http://127.0.0.1:3000",
      fixture: true,
      timeoutMs: 10000,
      maxRequests: 120,
      sleepMs: 0,
      fetchFn,
      sleepFn: async () => {},
      nowFn: () => "2026-09-04T00:00:00.000Z",
    });
    expect(stats.aborted).toBe(false);
    expect(records).toHaveLength(3);
    const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    for (const [requestUrl, init] of calls) {
      expect(String(requestUrl)).toContain("fixture=1");
      expect(init?.headers ?? {}).not.toHaveProperty("authorization");
    }
    expect(records[0]).toMatchObject({
      trust: 42,
      level: "caution",
      contentHash: "abcd1234",
      llmStep: null,
      fetchFailed: false,
    });
  });

  it("two dry runs with fixed clocks are byte-identical", async () => {
    const options = {
      rows: sampleRows(),
      baseUrl: "http://127.0.0.1:3000",
      fixture: true,
      timeoutMs: 10000,
      maxRequests: 120,
      sleepMs: 0,
      sleepFn: async () => {},
      nowFn: () => "2026-09-04T00:00:00.000Z",
    };
    const first = await runDataset({ ...options, fetchFn: fixtureFetch() });
    const second = await runDataset({ ...options, fetchFn: fixtureFetch() });
    expect(second.records).toEqual(first.records);
  });

  it("sleeps between calls but not after the last", async () => {
    const sleepFn = vi.fn(async () => {});
    await runDataset({
      rows: sampleRows(),
      baseUrl: "http://127.0.0.1:3000",
      fixture: true,
      timeoutMs: 10000,
      maxRequests: 120,
      sleepMs: 250,
      fetchFn: fixtureFetch(),
      sleepFn,
      nowFn: () => "2026-09-04T00:00:00.000Z",
    });
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(250);
  });

  it("honors the per-run request cap", async () => {
    const fetchFn = fixtureFetch();
    const { records, stats } = await runDataset({
      rows: sampleRows(),
      baseUrl: "http://127.0.0.1:3000",
      fixture: true,
      timeoutMs: 10000,
      maxRequests: 2,
      sleepMs: 0,
      fetchFn,
      sleepFn: async () => {},
      nowFn: () => "2026-09-04T00:00:00.000Z",
    });
    expect(stats.truncated).toBe(true);
    expect(stats.attempted).toBe(2);
    expect(records).toHaveLength(2);
  });

  it("aborts after three consecutive 429s and excludes failures", async () => {
    const fetchFn: FetchFn = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    }));
    const { records, stats } = await runDataset({
      rows: sampleRows(),
      baseUrl: "http://127.0.0.1:3000",
      fixture: true,
      timeoutMs: 10000,
      maxRequests: 120,
      sleepMs: 0,
      fetchFn,
      sleepFn: async () => {},
      nowFn: () => "2026-09-04T00:00:00.000Z",
    });
    expect(stats.aborted).toBe(true);
    expect(records).toHaveLength(3);
    expect(records.every((record) => record.fetchFailed)).toBe(true);
    expect(stats.excluded).toBe(3);
  });

  it("marks non-200 and bad-shape rows as excluded failures", async () => {
    const fetchFn: FetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ trust: "high", level: "safe" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ trust: 80, level: "safe" }),
      });
    const { records, stats } = await runDataset({
      rows: sampleRows(),
      baseUrl: "http://127.0.0.1:3000",
      fixture: true,
      timeoutMs: 10000,
      maxRequests: 120,
      sleepMs: 0,
      fetchFn,
      sleepFn: async () => {},
      nowFn: () => "2026-09-04T00:00:00.000Z",
    });
    expect(stats.aborted).toBe(false);
    expect(stats.excluded).toBe(2);
    expect(records[2].fetchFailed).toBe(false);
  });
});

describe("main", () => {
  it("refuses a keyed run without --confirm-spend before sending anything", async () => {
    const fetchFn = fixtureFetch();
    const logs: string[] = [];
    const code = await main(
      ["node", "run.mjs", "--live", "--out-dir=/tmp/unused-eval-out"],
      { fetchFn, log: (message: string) => logs.push(message) },
    );
    expect(code).toBe(2);
    expect(fetchFn as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(logs.join("\n")).toMatch(/REFUSED/);
  });

  it("runs the fixture end-to-end and writes JSONL + report", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "eval-"));
    const logs: string[] = [];
    const code = await main(
      [
        "node",
        "run.mjs",
        `--dataset=${join(EVAL_DIR, "dataset.sample.json")}`,
        "--base-url=http://127.0.0.1:3000",
        "--fixture",
        `--out-dir=${outDir}`,
      ],
      {
        fetchFn: (async (requestUrl: string) => {
          if (requestUrl.includes("/api/health")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                rubric: {
                  preset: "balanced",
                  source: "config/rubrics/balanced.json",
                },
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              trust: 42,
              level: "caution",
              provenance: {
                url: requestUrl,
                contentHash: "abcd1234",
                retrievedAt: "2026-09-04T00:00:00.000Z",
              },
            }),
          };
        }) as FetchFn,
        sleepFn: async () => {},
        nowFn: () => "2026-09-04T00:00:00.000Z",
        log: (message: string) => logs.push(message),
      },
    );
    expect(code).toBe(0);
    const jsonl = readFileSync(join(outDir, "records.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(jsonl).toHaveLength(9);
    const first = JSON.parse(jsonl[0]);
    expect(first).toMatchObject({
      trust: 42,
      level: "caution",
      fetchFailed: false,
    });
    const report = readFileSync(join(outDir, "report.md"), "utf8");
    expect(report).toMatch(/tier agreement/);
    expect(report).toMatch(/Confusion matrix/);
    expect(report).toMatch(/Pearson/);
    expect(report).toMatch(/Spearman/);
    expect(report).toMatch(/calibration/i);
    expect(report).toMatch(/fail-closed/);
    expect(report).toMatch(/\$0\.0000/);
  });
});
