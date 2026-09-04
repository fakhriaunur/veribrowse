#!/usr/bin/env node
// Mock OpenAI gateway (VAL-CROSS-009/010/011, VAL-CROSS-029/030).
//
// Serves BOTH chain paths with the same deterministic inner payload:
// - POST /v1/responses        -> Responses envelope; the route hand-rolls
//                               the `output_text` walk (a `reasoning` item
//                               is included first and must be skipped, plus
//                               a trailing non-text part that is never picked).
// - POST /v1/chat/completions -> Chat envelope (existing shape, unchanged).
//
// Error-injection parity: each path (`responses`, `chat`) accepts the same
// override object { status, rawBody, body, delayMs, refusal } via:
// - POST /__mock/inject  { "responses": {...}, "chat": {...} } (merge)
// - POST /__mock/reset   (clear overrides + request log)
// - GET  /__mock/requests -> ordered attempt log (proves Responses-before-
//   Chat order; responses entries record store/include/model from the body)
// delayMs is clamped into [0, 30000] (resource-exhaustion guard).
// Process-level seeds: MOCK_RESPONSES_STATUS / MOCK_CHAT_STATUS,
// MOCK_RESPONSES_DELAY_MS / MOCK_CHAT_DELAY_MS, MOCK_RESPONSES_BODY /
// MOCK_CHAT_BODY (JSON strings).
//
// GET / -> { ok:true } health (unchanged).
import http from "node:http";

const port = Number(process.env.MOCK_PORT ?? 8787);

/** Deterministic inner payload — identical on both paths. */
function mockInner() {
  return {
    // why >200 chars, bullets >3: exercises route slice caps on both paths.
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
  };
}

function responsesEnvelope(innerJson) {
  return {
    id: "resp_mock",
    status: "completed",
    model: "gpt-4o-mini",
    output: [
      // Reasoning items carry no output_text — the route walk must skip them
      // and never assume output[0] holds the message.
      { type: "reasoning", id: "rs_mock" },
      {
        type: "message",
        id: "msg_mock",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: innerJson },
          { type: "refusal", refusal: "never-picked" },
        ],
      },
    ],
  };
}

function chatEnvelope(innerJson) {
  return { choices: [{ message: { content: innerJson } }] };
}

function numEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function jsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Per-path overrides: null = healthy default. */
const overrides = {
  responses: null,
  chat: null,
};

for (const kind of ["responses", "chat"]) {
  const prefix = `MOCK_${kind.toUpperCase()}_`;
  const seed = {};
  const status = numEnv(`${prefix}STATUS`);
  if (status !== undefined) seed.status = status;
  const delayMs = numEnv(`${prefix}DELAY_MS`);
  if (delayMs !== undefined) seed.delayMs = delayMs;
  const body = jsonEnv(`${prefix}BODY`);
  if (body !== undefined) seed.body = body;
  if (Object.keys(seed).length > 0) overrides[kind] = seed;
}

/** Ordered attempt log — proves chain order via GET /__mock/requests. */
const requests = [];
let seq = 0;

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

// Upper bound for injected step delays (CodeQL js/resource-exhaustion):
// delayMs arrives via /__mock/inject, so the timer duration is clamped
// into [0, MAX_DELAY_MS] — never an unbounded user-controlled timeout.
const MAX_DELAY_MS = 30000;

function clampDelay(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_DELAY_MS, n);
}

function sleep(ms, req, res) {
  return new Promise((resolve) => {
    if (ms <= 0) {
      resolve(false);
      return;
    }
    // The request stream is already closed once its body is read (normal),
    // so a mid-delay client abort surfaces on the RESPONSE, not the request.
    // Listen on both; already-closed emitters simply never fire again.
    const t = setTimeout(() => {
      cleanup();
      resolve(false);
    }, ms);
    const onClose = () => {
      clearTimeout(t);
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      req.removeListener("close", onClose);
      res.removeListener("close", onClose);
    };
    req.once("close", onClose);
    res.once("close", onClose);
  });
}

function innerJson(override) {
  const inner = override?.body ?? mockInner();
  return typeof inner === "string" ? inner : JSON.stringify(inner);
}

function refusalEnvelope(kind) {
  return kind === "responses"
    ? { status: "incomplete", output: [] }
    : { choices: [{ message: { content: "" }, finish_reason: "refusal" }] };
}

function errorResult(override, status) {
  return {
    status,
    note: "error",
    raw:
      typeof override?.body === "string"
        ? override.body
        : "mock upstream error",
  };
}

// Decide what a chain step gets: refusal/incomplete and rawBody injections
// fail the step (never terminal for the chain); non-2xx status fails it;
// otherwise the path's envelope with the deterministic inner payload.
function llmResult(kind, override) {
  if (override?.refusal) {
    return { status: 200, note: "refusal", envelope: refusalEnvelope(kind) };
  }
  if (typeof override?.rawBody === "string") {
    return { status: 200, note: "rawBody", raw: override.rawBody };
  }
  const status = Number(override?.status ?? 200);
  if (status < 200 || status >= 300) {
    return errorResult(override, status);
  }
  const json = innerJson(override);
  return {
    status: 200,
    envelope:
      kind === "responses" ? responsesEnvelope(json) : chatEnvelope(json),
  };
}

function attemptEntry(kind, req, parsed) {
  const entry = {
    seq: (seq += 1),
    method: req.method,
    path: kind === "responses" ? "/v1/responses" : "/v1/chat/completions",
    at: new Date().toISOString(),
    model: parsed?.model,
    temperature: parsed?.temperature,
  };
  if (kind === "responses") {
    entry.store = parsed?.store;
    entry.include = parsed?.include;
  }
  return entry;
}

async function handleLlm(kind, req, res, rawBody) {
  let parsed = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }
  const override = overrides[kind];
  const aborted = await sleep(clampDelay(override?.delayMs), req, res);
  if (aborted) return;
  // NOTE: req.destroyed is true once the request body is fully read (normal
  // in modern Node) — it must NOT gate the response. Only res.destroyed
  // (client went away mid-delay) means there is nobody left to answer.
  if (res.destroyed) return;

  const result = llmResult(kind, override);
  const entry = attemptEntry(kind, req, parsed);
  entry.status = result.status;
  if (result.note) entry.note = result.note;
  requests.push(entry);
  if (result.raw !== undefined) {
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(result.raw);
    return;
  }
  sendJson(res, result.status, result.envelope);
}

function applyInject(patch) {
  for (const kind of ["responses", "chat"]) {
    if (patch?.[kind] !== undefined) {
      overrides[kind] =
        patch[kind] === null
          ? null
          : { ...(overrides[kind] ?? {}), ...patch[kind] };
    }
  }
}

async function handleInject(req, res) {
  const raw = await readBody(req);
  let patch = null;
  try {
    patch = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  applyInject(patch);
  sendJson(res, 200, { ok: true, overrides });
}

// Control plane for error injection + attempt log. Returns true when the
// request was a control call (caller must return afterwards).
async function handleControl(req, res, url) {
  if (url.pathname === "/__mock/requests" && req.method === "GET") {
    sendJson(res, 200, { requests: requests.slice(-200) });
    return true;
  }
  if (url.pathname === "/__mock/inject" && req.method === "POST") {
    await handleInject(req, res);
    return true;
  }
  if (url.pathname === "/__mock/reset" && req.method === "POST") {
    await readBody(req);
    overrides.responses = null;
    overrides.chat = null;
    requests.length = 0;
    sendJson(res, 200, { ok: true });
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (await handleControl(req, res, url)) return;
  if (url.pathname.startsWith("/v1/responses") && req.method === "POST") {
    const raw = await readBody(req);
    await handleLlm("responses", req, res, raw);
    return;
  }
  if (url.pathname.startsWith("/v1/chat") && req.method === "POST") {
    const raw = await readBody(req);
    await handleLlm("chat", req, res, raw);
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, mock: true }));
});
server.listen(port, () => console.log(`mock listening on ${port}`));
