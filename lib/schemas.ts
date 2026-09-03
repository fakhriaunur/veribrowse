import { z } from "zod";

// Shared single source of truth for WebMCP inputSchema + Edge validation (pp DRY).
export const scoreWebsiteSchema = z.object({
  url: z.string().url().describe("URL to score for scam/trust"),
});

export const checkClaimSchema = z.object({
  claim: z.string().min(8).max(500).describe("Claim text to verify"),
  contextUrl: z
    .string()
    .url()
    .optional()
    .describe("Optional URL providing context for the claim"),
});

export type ScoreWebsiteInput = z.infer<typeof scoreWebsiteSchema>;
export type CheckClaimInput = z.infer<typeof checkClaimSchema>;

// For JSON Schema export to WebMCP registerTool (zod -> JSON Schema manual to avoid extra dep).
export function zodToJsonSchema(
  shape: Record<string, unknown>,
): Record<string, unknown> {
  return shape;
}

export const scoreWebsiteJsonSchema = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "URL to score for scam/trust",
      format: "uri",
    },
  },
  required: ["url"],
  additionalProperties: false,
} as const;

export const checkClaimJsonSchema = {
  type: "object",
  properties: {
    claim: {
      type: "string",
      description: "Claim text to verify",
      minLength: 8,
      maxLength: 500,
    },
    contextUrl: {
      type: "string",
      description: "Optional URL providing context",
      format: "uri",
    },
  },
  required: ["claim"],
  additionalProperties: false,
} as const;
