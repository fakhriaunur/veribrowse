import { test, expect } from "@playwright/test";

test("health endpoint", async ({ request }) => {
  const res = await request.get("http://127.0.0.1:3000/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("score fixture", async ({ request }) => {
  const res = await request.get(
    "http://127.0.0.1:3000/api/score?url=https://example.com&fixture=1",
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.trust).toBeDefined();
  expect(body.level).toMatch(/safe|caution|risky/);
});

test("check fixture", async ({ request }) => {
  const res = await request.get(
    "http://127.0.0.1:3000/api/check?claim=hello%20world%20claim%20text&fixture=1",
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.verdict).toMatch(/supported|contradicted|unverified/);
});
