import { test, expect } from "@playwright/test";

// Agent-browser skill: headless Chrome verification of WebMCP tool registration
// Uses page.addInitScript to stub document.modelContext before app loads — mirrors
// chrome headless with --enable-features=WebMCP / Chrome 149 flag behavior.

test.describe("WebMCP browser discovery (agent-browser)", () => {
  test("registers and discovers 4 tools with mocked modelContext", async ({ page }) => {
    const registered: string[] = [];

    await page.addInitScript(() => {
      // @ts-ignore
      window.__veribrowseMockTools = [];
      // @ts-ignore
      document.modelContext = {
        // @ts-ignore
        registerTool: async (tool: { name: string }) => {
          // @ts-ignore
          window.__veribrowseMockTools.push(tool.name);
        },
        getTools: async () => {
          // @ts-ignore
          return window.__veribrowseMockTools.map((n: string) => ({ name: n, description: "mock" }));
        },
      };
    });

    await page.goto("/");
    await page.waitForTimeout(1500); // allow useEffect registrations

    const count = await page.evaluate(() => {
      // @ts-ignore
      return (window.__veribrowseMockTools as string[]).length;
    });

    expect(count).toBe(4);
    expect(await page.evaluate(() => (window as unknown as { __veribrowseMockTools: string[] }).__veribrowseMockTools)).toEqual(
      expect.arrayContaining(["ping", "echoEcho", "scoreWebsite", "checkClaim"]),
    );

    // UI fallback shows tools when discovered
    await expect(page.getByText("WebMCP: 4 tools")).toBeVisible({ timeout: 2_000 });
  });

  test("page renders without WebMCP (graceful fallback)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("VeriBrowse")).toBeVisible();
    await expect(page.getByText("Score a website")).toBeVisible();
    await expect(page.getByText("Check a claim")).toBeVisible();
    // Without mock, fallback text should mention WebMCP not detected
    await expect(page.getByText(/WebMCP: not detected/)).toBeVisible();
  });

  test("manual score and check flows update UI (no WebMCP needed)", async ({ page }) => {
    await page.goto("/");
    // Score flow
    await page.getByPlaceholder("https://example.com").fill("https://example.com");
    await page.getByRole("button", { name: "Score" }).click();
    await expect(page.getByText(/Score \d+\/100/)).toBeVisible({ timeout: 5_000 });
    // Check flow
    await page.getByPlaceholder("Claim text").fill("This claim is a fixture for deterministic test only");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText(/Not enough evidence|Claim looks/)).toBeVisible({ timeout: 5_000 });
  });
});
