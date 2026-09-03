#!/usr/bin/env node
// Generate docs/api.md from lib/ pure core via typedoc or lightweight fallback.
// Prefers typedoc+markdown plugin; falls back to manual extraction if not installed.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "docs", "api.md");

// Attempt typedoc synchronously; if fails, write manual docs
/* eslint-disable no-console */
function manualGen() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const header = `# API — VeriBrowse lib/ (generated)\n\n> Generated from \`lib/\` pure core via \`mise run docs\` (typedoc + fallback). Do not edit by hand.\n\nSource: \`lib/score.ts\`, \`lib/claim.ts\`, \`lib/schemas.ts\`, \`lib/logger.ts\`, \`lib/metrics.ts\`, \`lib/fetchWithRetry.ts\`\n\nVersion: \`${pkg.version}\` — aligns with \`GET /api/health\` \`version: "0.1.0"\` and \`package.json\`.\n\nGenerate: \`mise run docs\` or \`npm run docs\` or \`pnpm docs\` (reads \`typedoc.json\` → \`lib/\` → \`docs/api.md\`).\n\n---\n\n`;

  const sections = [];

  // helper to read exports quickly
  const files = [
    {
      path: "lib/score.ts",
      title: "lib/score.ts — Scoring (TrustScore)",
      anchor: "score",
    },
    {
      path: "lib/claim.ts",
      title: "lib/claim.ts — Verification (ClaimResult)",
      anchor: "claim",
    },
    {
      path: "lib/schemas.ts",
      title: "lib/schemas.ts — Zod Schemas (single source)",
      anchor: "schemas",
    },
    {
      path: "lib/logger.ts",
      title: "lib/logger.ts — pino Logger",
      anchor: "logger",
    },
    {
      path: "lib/metrics.ts",
      title: "lib/metrics.ts — In-memory Counters",
      anchor: "metrics",
    },
    {
      path: "lib/fetchWithRetry.ts",
      title: "lib/fetchWithRetry.ts — Bounded Fetch",
      anchor: "fetch",
    },
  ];

  for (const f of files) {
    const full = join(root, f.path);
    if (!existsSync(full)) continue;
    const src = readFileSync(full, "utf8");
    // extract exported types/functions via simple regex
    const exports = [
      ...src.matchAll(
        /export\s+(?:type|interface|function|const|async function)\s+(\w+)/g,
      ),
    ].map((m) => m[1]);
    const excerpt = src.split("\n").slice(0, 120).join("\n");
    sections.push(
      `## ${f.title}\n\nPath: \`${f.path}\`\n\nExports: \`${exports.join("`, `") || "(see source)"}\`\n\n\`\`\`ts\n${excerpt}\n\`\`\`\n`,
    );
  }

  const schemasDetail = `
### Schemas (Zod → JSON Schema)

- \`scoreWebsiteSchema\` — \`{ url: string(url) }\` → JSON Schema \`{ type:"object", required:["url"], properties:{url:{type:"string",format:"uri"}} }\`
- \`checkClaimSchema\` — \`{ claim: string(8-500), contextUrl?: string(url) }\`
- WebMCP tool schemas are single-sourced from these; API routes validate via \`schema.parse\` then propagate \`AbortSignal\`.

See \`lib/schemas.ts\` for \`scoreWebsiteJsonSchema\` and \`checkClaimJsonSchema\` literals used in \`app/page.tsx\` \`registerTool\`.
`;

  const scoringDetail = `
### Scoring heuristic (scoreWebsitePure)

Inputs \`FetchMeta\` → trust 50 +/- https(10/-20), domainAge >365 (+15) / <30 (-20), title/ogDescription (+5 each), redirect reason. Clamped 0-100. Level: \`safe >=70\`, \`caution 40-69\`, \`risky <40\`. \`elderlySummarize\` prefixes ✅/⚠️/⛔. \`buildTrustScore\` injects optional LLM \`why\`/\`bullets\`.

Provenance: \`{ url, contentHash, retrievedAt }\` + \`citations: [{url,snippet}]\` on every 200.
`;

  const claimDetail = `
### Verification (verifyClaimPure) — fail-closed

Evidence \`null|[]\` → \`{ verdict:"unverified", confidence:0.3, evidence:[] }\` — never hallucinated. Else LLM verdict/confidence or defaults. \`claimHash\` 16-hex via \`simpleHash\`, \`checkedAt\` ISO.

Evidence fetched from \`contextUrl\` (quote ≤500 chars, \`contentHash\`, \`retrievedAt\`) via \`fetchWithRetry\` 3s/2 retries/30s breaker. OpenAI called only if \`evidence.length>0\`.
`;

  const body =
    header +
    sections.join("\n---\n\n") +
    "\n---\n" +
    schemasDetail +
    scoringDetail +
    claimDetail +
    `
---
Generated at ${new Date().toISOString()} — run \`mise run docs\` to refresh.
`;

  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(outFile, body);
  console.log(`[gen_docs] wrote fallback ${outFile} (${body.length} bytes)`);
}
/* eslint-enable no-console */

/* eslint-disable no-console, max-depth */
const usedTypedoc = (() => {
  try {
    execSync("npx typedoc --version", { stdio: "ignore", cwd: root });
    console.log("[gen_docs] typedoc available — attempting typedoc generation");
    try {
      execSync("npx typedoc", { stdio: "inherit", cwd: root });
      const tmpDir = join(root, "docs", "api.tmp");
      if (existsSync(tmpDir)) {
        const files = execSync(`find "${tmpDir}" -name "*.md" | sort`, {
          encoding: "utf8",
        })
          .trim()
          .split("\n")
          .filter(Boolean);
        if (files.length) {
          let combined = `# API — VeriBrowse lib/ (typedoc)\n\n> Generated from \`lib/\` pure core. Do not edit — run \`mise run docs\` to regenerate.\n\n`;
          const pkg = JSON.parse(
            readFileSync(join(root, "package.json"), "utf8"),
          );
          combined += `Version: \`${pkg.version}\` — typedoc via \`typedoc.json\` → \`lib/\` → \`docs/api.md\`.\n\n---\n\n`;
          for (const f of files) {
            combined +=
              `<!-- ${f.replace(tmpDir + "/", "")} -->\n` +
              readFileSync(f, "utf8") +
              "\n\n---\n\n";
          }
          mkdirSync(join(root, "docs"), { recursive: true });
          writeFileSync(outFile, combined);
          console.log(
            `[gen_docs] typedoc concatenated ${files.length} files → ${outFile}`,
          );
          process.exit(0);
        }
      }
    } catch (e) {
      console.warn("[gen_docs] typedoc run failed, falling back", e.message);
    }
  } catch {
    console.log("[gen_docs] typedoc not installed, using fallback");
  }
  return false;
})();
/* eslint-enable no-console, max-depth */

if (!usedTypedoc) {
  // ensure fallback
  if (!existsSync(outFile) || readFileSync(outFile, "utf8").length < 500) {
    manualGen();
  } else {
    // still refresh fallback to keep date current if tmp not used
    manualGen();
  }
}
