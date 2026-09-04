import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scoreWebsitePure, type FetchMeta } from "@/lib/score";
import {
  loadActiveRubric,
  getActiveRubric,
  resetRubricCache,
  parseRubric,
  RUBRIC_PRESET_NAMES,
} from "@/lib/rubric";
import balancedPreset from "@/config/rubrics/balanced.json";
import { GET as healthGet } from "@/app/api/health/route";

// Rubric presets (VAL-CFG-058): balanced MUST stay byte-identical to the
// frozen lib/score.ts weights; preset select + file override work; invalid
// preset/override fails loudly; verbose health echoes the active preset.

const FROZEN_WEIGHTS = {
  base: 50,
  httpsBonus: 10,
  noHttpsPenalty: -20,
  oldDomainBonus: 15,
  oldDomainDays: 365,
  newDomainPenalty: -20,
  newDomainDays: 30,
  titleBonus: 5,
  titleMinLength: 5,
  ogBonus: 5,
};

const FROZEN_THRESHOLDS = { safe: 70, caution: 40 };

function meta(over: Partial<FetchMeta> = {}): FetchMeta {
  return {
    url: "https://example.com",
    finalUrl: "https://example.com",
    status: 200,
    contentHash: "abcd1234",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    hasHttps: true,
    ...over,
  };
}

describe("rubric presets", () => {
  const savedPreset = process.env.SCORING_PRESET;
  const savedPath = process.env.SCORING_RUBRIC_PATH;

  beforeEach(() => {
    resetRubricCache();
    delete process.env.SCORING_PRESET;
    delete process.env.SCORING_RUBRIC_PATH;
  });

  afterEach(() => {
    if (savedPreset === undefined) delete process.env.SCORING_PRESET;
    else process.env.SCORING_PRESET = savedPreset;
    if (savedPath === undefined) delete process.env.SCORING_RUBRIC_PATH;
    else process.env.SCORING_RUBRIC_PATH = savedPath;
    resetRubricCache();
  });

  it("balanced preset is byte-identical to frozen weights", () => {
    expect(balancedPreset.name).toBe("balanced");
    expect(balancedPreset.weights).toEqual(FROZEN_WEIGHTS);
    expect(balancedPreset.thresholds).toEqual(FROZEN_THRESHOLDS);
  });

  it("frozen scoring behavior matches balanced golden matrix", () => {
    // https + aged + title + og: 50+10+15+5+5 = 85 safe
    expect(
      scoreWebsitePure(
        meta({
          title: "Example Domain",
          ogDescription: "desc",
          domainAgeDays: 400,
        }),
      ).trust,
    ).toBe(85);
    // no https + new domain, no title/og: 50-20-20 = 10 risky
    const risky = scoreWebsitePure(
      meta({ hasHttps: false, domainAgeDays: 5, title: "x" }),
    );
    expect(risky.trust).toBe(10);
    expect(risky.level).toBe("risky");
    // https only, mid-age, no title/og: 50+10 = 60 caution
    const mid = scoreWebsitePure(meta({ domainAgeDays: 100 }));
    expect(mid.trust).toBe(60);
    expect(mid.level).toBe("caution");
    // https + title + og, unknown age: 50+10+5+5 = 70 safe (boundary)
    const edge = scoreWebsitePure(
      meta({ title: "Example", ogDescription: "desc", domainAgeDays: null }),
    );
    expect(edge.trust).toBe(70);
    expect(edge.level).toBe("safe");
  });

  it("ships exactly balanced/strict/lenient presets", () => {
    expect([...RUBRIC_PRESET_NAMES]).toEqual(["balanced", "strict", "lenient"]);
  });

  it("defaults to balanced when env is untouched", () => {
    const active = loadActiveRubric({});
    expect(active.name).toBe("balanced");
    expect(active.source).toBe("config/rubrics/balanced.json");
    expect(active.rubric.weights).toEqual(FROZEN_WEIGHTS);
  });

  it("SCORING_PRESET=strict changes weights per preset", () => {
    const active = loadActiveRubric({ SCORING_PRESET: "strict" });
    expect(active.name).toBe("strict");
    expect(active.source).toBe("config/rubrics/strict.json");
    expect(active.rubric.weights).not.toEqual(FROZEN_WEIGHTS);
    expect(active.rubric.weights.noHttpsPenalty).toBeLessThan(
      FROZEN_WEIGHTS.noHttpsPenalty,
    );
    expect(active.rubric.thresholds.safe).toBeGreaterThan(
      FROZEN_THRESHOLDS.safe,
    );
  });

  it("SCORING_PRESET=lenient changes weights per preset", () => {
    const active = loadActiveRubric({ SCORING_PRESET: "lenient" });
    expect(active.name).toBe("lenient");
    expect(active.rubric.weights.base).toBeGreaterThan(FROZEN_WEIGHTS.base);
    expect(active.rubric.thresholds.safe).toBeLessThan(FROZEN_THRESHOLDS.safe);
  });

  it("SCORING_RUBRIC_PATH override file loads and wins", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rubric-"));
    const file = path.join(dir, "custom.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        name: "custom",
        version: 1,
        weights: { ...FROZEN_WEIGHTS, base: 55 },
        thresholds: { ...FROZEN_THRESHOLDS },
      }),
    );
    try {
      const active = loadActiveRubric({
        SCORING_PRESET: "strict",
        SCORING_RUBRIC_PATH: file,
      });
      expect(active.name).toBe("custom");
      expect(active.source).toBe(file);
      expect(active.rubric.weights.base).toBe(55);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("unknown SCORING_PRESET fails loudly", () => {
    expect(() => loadActiveRubric({ SCORING_PRESET: "bogus" })).toThrow(
      /Invalid SCORING_PRESET="bogus"/,
    );
  });

  it("missing override file fails loudly", () => {
    expect(() =>
      loadActiveRubric({
        SCORING_RUBRIC_PATH: "/nonexistent/rubric.json",
      }),
    ).toThrow(/Invalid SCORING_RUBRIC_PATH/);
  });

  it("malformed override JSON fails loudly", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rubric-"));
    const file = path.join(dir, "bad.json");
    fs.writeFileSync(file, "{not valid json");
    try {
      expect(() => loadActiveRubric({ SCORING_RUBRIC_PATH: file })).toThrow(
        /not valid JSON/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("schema-violating override fails loudly", () => {
    // Missing thresholds + wrong weight type + unknown property.
    expect(() =>
      parseRubric(
        {
          name: "bad",
          version: 1,
          weights: { ...FROZEN_WEIGHTS, base: "fifty", extra: 1 },
        },
        "test-source",
      ),
    ).toThrow(/fails config\/rubrics\/schema\.json/);
  });

  it("safe <= caution threshold ordering fails loudly", () => {
    expect(() =>
      parseRubric(
        {
          name: "flat",
          version: 1,
          weights: { ...FROZEN_WEIGHTS },
          thresholds: { safe: 40, caution: 40 },
        },
        "test-source",
      ),
    ).toThrow(/must be greater than thresholds\.caution/);
  });

  it("getActiveRubric loads once (same identity)", () => {
    expect(getActiveRubric()).toBe(getActiveRubric());
    expect(getActiveRubric().name).toBe("balanced");
  });

  it("verbose health echoes the active preset", async () => {
    const req = new Request("http://localhost/api/health?verbose=1");
    const res = await healthGet(req);
    const json = (await res.json()) as {
      status: string;
      uptime: number;
      rubric: { preset: string; source: string };
    };
    expect(json.status).toBe("ok");
    expect(json.uptime).toBeDefined();
    expect(json.rubric.preset).toBe("balanced");
    expect(json.rubric.source).toBe("config/rubrics/balanced.json");
  });

  it("non-verbose health stays minimal (no uptime, no rubric)", async () => {
    const res = await healthGet();
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.status).toBe("ok");
    expect("uptime" in json).toBe(false);
    expect("rubric" in json).toBe(false);
  });

  it("verbose health reflects SCORING_PRESET=strict", async () => {
    process.env.SCORING_PRESET = "strict";
    resetRubricCache();
    const req = new Request("http://localhost/api/health?verbose=1");
    const res = await healthGet(req);
    const json = (await res.json()) as {
      rubric: { preset: string; source: string };
    };
    expect(json.rubric.preset).toBe("strict");
    expect(json.rubric.source).toBe("config/rubrics/strict.json");
  });

  it("health fails loudly on invalid preset", async () => {
    process.env.SCORING_PRESET = "bogus";
    resetRubricCache();
    const req = new Request("http://localhost/api/health?verbose=1");
    await expect(healthGet(req)).rejects.toThrow(/Invalid SCORING_PRESET/);
  });
});
