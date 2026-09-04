import { describe, it, expect, beforeEach } from "vitest";
import {
  addRecent,
  clearRecents,
  fromClaimResult,
  fromTrustScore,
  loadRecents,
  persistRecents,
  RECENTS_KEY,
  RECENTS_MAX,
  type RecentEntry,
} from "@/lib/recents";
import type { TrustScore } from "@/lib/score";
import type { ClaimResult } from "@/lib/claim";

// Client recents (VAL-WEB-019): bounded, evict-oldest, user-clearable,
// summaries only — never secrets or page HTML. Server untouched.
// NOTE: scanner-safe — key material is built without a contiguous prefix.

function secretLike(): string {
  return ["s", "k", "-"].join("") + "testkeymaterial1234567890";
}

function scoreEntry(url: string, trust = 70): RecentEntry {
  return {
    kind: "score",
    id: `score-${url}`,
    url,
    trust,
    level: "safe",
    summary: `Score ${trust}/100 summary`,
    at: new Date().toISOString(),
  };
}

function fullScore(): TrustScore {
  return {
    trust: 70,
    level: "safe",
    elderlySummary: "Safe to browse summary",
    bullets: ["Standard signals"],
    why: "Standard signals",
    provenance: {
      url: "https://example.com",
      contentHash: "deadbeef",
      retrievedAt: new Date().toISOString(),
    },
    citations: [{ url: "https://example.com", snippet: "Example" }],
    raw: {
      url: "https://example.com",
      contentHash: "deadbeef",
      retrievedAt: new Date().toISOString(),
      hasHttps: true,
    },
  };
}

function fullClaim(): ClaimResult {
  return {
    verdict: "supported",
    confidence: 0.82,
    elderlySummary: "Supported summary",
    reasoning: "Matches source",
    evidence: [
      {
        url: "https://example.com",
        quote: "quoted page text that must not be stored",
        contentHash: "deadbeef",
        retrievedAt: new Date().toISOString(),
      },
    ],
    provenance: {
      claim: "hello world claim text",
      claimHash: "0123456789abcdef",
      checkedAt: new Date().toISOString(),
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("client recents store", () => {
  it("caps the list and evicts oldest first", () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < RECENTS_MAX + 3; i++)
      list = addRecent(list, scoreEntry(`https://example.com/${i}`));
    expect(list).toHaveLength(RECENTS_MAX);
    const urls = list.map((e) => (e as { url: string }).url);
    expect(urls).not.toContain("https://example.com/0");
    expect(urls[0]).toBe(`https://example.com/${RECENTS_MAX + 2}`);
  });

  it("re-scoring the same URL moves it to the front without duplicates", () => {
    let list: RecentEntry[] = [];
    list = addRecent(list, scoreEntry("https://a.example"));
    list = addRecent(list, scoreEntry("https://b.example"));
    list = addRecent(list, scoreEntry("https://a.example"));
    expect(list).toHaveLength(2);
    expect((list[0] as { url: string }).url).toBe("https://a.example");
  });

  it("score summaries carry no raw HTML, citations, hashes, or secrets", () => {
    const entry = fromTrustScore(fullScore());
    expect(entry).not.toBeNull();
    const keys = Object.keys(entry!).sort();
    expect(keys).toEqual(
      ["at", "id", "kind", "level", "summary", "trust", "url"].sort(),
    );
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("deadbeef");
    expect(serialized).not.toContain("citations");
    expect(serialized).not.toContain(secretLike());
  });

  it("claim summaries carry no evidence quotes or claim secrets", () => {
    const entry = fromClaimResult(fullClaim());
    expect(entry).not.toBeNull();
    const keys = Object.keys(entry!).sort();
    expect(keys).toEqual(
      [
        "at",
        "claim",
        "confidence",
        "evidenceCount",
        "id",
        "kind",
        "summary",
        "verdict",
      ].sort(),
    );
    expect(JSON.stringify(entry)).not.toContain(
      "quoted page text that must not be stored",
    );
  });

  it("refuses entries containing key material", () => {
    const bad = scoreEntry("https://example.com");
    (bad as { summary: string }).summary = `leaked ${secretLike()} here`;
    expect(addRecent([], bad)).toEqual([]);
    const badScore = { ...fullScore(), elderlySummary: secretLike() };
    expect(fromTrustScore(badScore)).toBeNull();
  });

  it("persists across reload, bounded, and clears on demand", () => {
    const list = [
      scoreEntry("https://a.example"),
      scoreEntry("https://b.example"),
    ];
    persistRecents(list);
    expect(loadRecents()).toHaveLength(2);
    // Corrupt + oversized payloads are filtered, never crash.
    window.localStorage.setItem(RECENTS_KEY, "not-json{{{");
    expect(loadRecents()).toEqual([]);
    persistRecents(list);
    clearRecents();
    expect(window.localStorage.getItem(RECENTS_KEY)).toBeNull();
    expect(loadRecents()).toEqual([]);
  });

  it("loadRecents drops malformed entries", () => {
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([
        scoreEntry("https://ok.example"),
        { kind: "nope" },
        null,
      ]),
    );
    const loaded = loadRecents();
    expect(loaded).toHaveLength(1);
    expect((loaded[0] as { url: string }).url).toBe("https://ok.example");
  });
});
