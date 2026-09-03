#!/usr/bin/env node
import http from "node:http";
const port = Number(process.env.MOCK_PORT ?? 8787);
const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/v1/chat")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      // deterministic mock payload exercising slice/clamp branches
      // why >200 chars, bullets >3, confidence within 0-1, verdict valid
      const mockContent = JSON.stringify({
        why: "Mock LLM why from local mock — deterministic for VAL-API-014 — this why string is intentionally long to exercise slicing at 200 characters limit and ensure truncation behavior works correctly even when the model returns verbose output",
        bullets: [
          "Mock bullet one — testing slice cap 1",
          "Mock bullet two — testing slice cap 2",
          "Mock bullet three — testing slice cap 3",
          "Mock bullet four — extra beyond cap should be sliced away",
        ],
        verdict: "supported",
        confidence: 0.92,
        reasoning:
          "Mock reasoning for check — deterministic mock that verifies evidence-backed verdict and ensures reasoning slicing at 300 chars works even with long input strings for VAL-API-014 mock path",
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: mockContent } }],
        }),
      );
    });
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, mock: true }));
});
server.listen(port, () => console.log(`mock listening on ${port}`));
