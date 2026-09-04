/**
 * Scoring rubric presets (M11 — VAL-CFG-058).
 *
 * `config/rubrics/*.json` ships three presets: `balanced` (default,
 * byte-identical to the frozen `lib/score.ts` heuristic weights),
 * `strict` (elder-protection opt-in), and `lenient` (bulk-triage opt-in).
 * `SCORING_PRESET` selects the active shipped preset; `SCORING_RUBRIC_PATH`
 * overrides with a custom rubric file and wins when set.
 *
 * Every rubric — shipped or override — is validated at load against
 * `config/rubrics/schema.json`. An unknown preset name, an unreadable or
 * unparsable override, or a schema violation throws loudly: the server
 * refuses to start/score with unknown weights and never silently falls
 * back to different weights.
 *
 * Loaded once per process (serverless-safe): `getActiveRubric()` caches
 * the first load. `loadActiveRubric(env, readFile)` is the injectable
 * core used by tests. The frozen `lib/score.ts` pure core is untouched —
 * `balanced` is pinned byte-identical to its constants by regression
 * test instead of by wiring.
 */

import fs from "node:fs";
import path from "node:path";
import balancedData from "@/config/rubrics/balanced.json";
import strictData from "@/config/rubrics/strict.json";
import lenientData from "@/config/rubrics/lenient.json";
import schemaData from "@/config/rubrics/schema.json";

export type RubricWeights = {
  base: number;
  httpsBonus: number;
  noHttpsPenalty: number;
  oldDomainBonus: number;
  oldDomainDays: number;
  newDomainPenalty: number;
  newDomainDays: number;
  titleBonus: number;
  titleMinLength: number;
  ogBonus: number;
};

export type RubricThresholds = {
  safe: number;
  caution: number;
};

export type Rubric = {
  name: string;
  version: number;
  description?: string;
  weights: RubricWeights;
  thresholds: RubricThresholds;
};

export type ActiveRubric = {
  /** Preset/file name (e.g. "balanced", "strict", or a custom file's name). */
  name: string;
  /** Where it loaded from: shipped label or resolved override path. */
  source: string;
  rubric: Rubric;
};

export const RUBRIC_PRESET_NAMES = ["balanced", "strict", "lenient"] as const;
export type RubricPresetName = (typeof RUBRIC_PRESET_NAMES)[number];

type JsonSchema = Record<string, unknown>;

const RUBRIC_SCHEMA = schemaData as unknown as JsonSchema;

const SHIPPED: Record<string, { data: unknown; source: string }> = {
  balanced: { data: balancedData, source: "config/rubrics/balanced.json" },
  strict: { data: strictData, source: "config/rubrics/strict.json" },
  lenient: { data: lenientData, source: "config/rubrics/lenient.json" },
};

function schemaTypeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  if (typeof value === "number") return "number";
  return typeof value;
}

function isTypeMatch(value: unknown, type: string): boolean {
  switch (type) {
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

/**
 * Minimal JSON-Schema validation driven by the shipped schema file:
 * supports the keywords our schema uses (type, required, properties,
 * additionalProperties, minimum, maximum, minLength, enum) and ignores
 * annotation keywords ($schema, $id, title, description).
 */
function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  trail: string,
  errors: string[],
): void {
  const type = schema.type as string | undefined;
  if (type !== undefined && !isTypeMatch(value, type)) {
    errors.push(
      `${trail}: expected type ${type}, got ${schemaTypeName(value)}`,
    );
    return;
  }
  if (typeof value === "string") {
    const minLength = schema.minLength as number | undefined;
    if (minLength !== undefined && value.length < minLength) {
      errors.push(
        `${trail}: shorter than minLength ${minLength} (got ${value.length})`,
      );
    }
    const enumVals = schema.enum as unknown[] | undefined;
    if (enumVals !== undefined && !enumVals.includes(value)) {
      errors.push(`${trail}: not one of ${JSON.stringify(enumVals)}`);
    }
    return;
  }
  if (typeof value === "number") {
    const minimum = schema.minimum as number | undefined;
    const maximum = schema.maximum as number | undefined;
    if (minimum !== undefined && value < minimum) {
      errors.push(`${trail}: ${value} below minimum ${minimum}`);
    }
    if (maximum !== undefined && value > maximum) {
      errors.push(`${trail}: ${value} above maximum ${maximum}`);
    }
    return;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const required = (schema.required as string[] | undefined) ?? [];
    for (const key of required) {
      if (!(key in record)) {
        errors.push(`${trail}: missing required property "${key}"`);
      }
    }
    const properties =
      (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in record) {
        validateAgainstSchema(
          record[key],
          propSchema,
          `${trail}.${key}`,
          errors,
        );
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) {
          errors.push(`${trail}: unexpected property "${key}"`);
        }
      }
    }
  }
}

/** Validate raw data against the shipped schema; throw loudly on violation. */
export function parseRubric(data: unknown, sourceLabel: string): Rubric {
  const errors: string[] = [];
  validateAgainstSchema(data, RUBRIC_SCHEMA, "rubric", errors);
  if (errors.length > 0) {
    throw new Error(
      `Invalid scoring rubric at ${sourceLabel} (fails config/rubrics/schema.json):\n- ${errors.join("\n- ")}`,
    );
  }
  const rubric = data as Rubric;
  if (!(rubric.thresholds.safe > rubric.thresholds.caution)) {
    throw new Error(
      `Invalid scoring rubric at ${sourceLabel}: thresholds.safe (${rubric.thresholds.safe}) must be greater than thresholds.caution (${rubric.thresholds.caution})`,
    );
  }
  return rubric;
}

export type RubricEnv = {
  SCORING_PRESET?: string | undefined;
  SCORING_RUBRIC_PATH?: string | undefined;
};

function defaultReadFile(resolvedPath: string): string {
  return fs.readFileSync(resolvedPath, "utf8");
}

/**
 * Resolve the active rubric from env: `SCORING_RUBRIC_PATH` override wins
 * when set, otherwise `SCORING_PRESET` (default `balanced`). Throws on
 * unknown preset, unreadable/unparsable override, or schema violation —
 * never falls back to different weights silently.
 */
export function loadActiveRubric(
  env: RubricEnv & { [key: string]: string | undefined } = process.env,
  readFile: (resolvedPath: string) => string = defaultReadFile,
): ActiveRubric {
  const overrideRaw = (env.SCORING_RUBRIC_PATH ?? "").trim();
  if (overrideRaw) {
    const resolved = path.isAbsolute(overrideRaw)
      ? overrideRaw
      : path.resolve(process.cwd(), overrideRaw);
    let text: string;
    try {
      text = readFile(resolved);
    } catch (e) {
      throw new Error(
        `Invalid SCORING_RUBRIC_PATH="${overrideRaw}" (resolved ${resolved}): cannot read file: ${String(e)}. Refusing to start with unknown weights.`,
      );
    }
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch (e) {
      throw new Error(
        `Invalid SCORING_RUBRIC_PATH="${overrideRaw}" (resolved ${resolved}): not valid JSON: ${String(e)}. Refusing to start with unknown weights.`,
      );
    }
    const rubric = parseRubric(data, resolved);
    return { name: rubric.name, source: resolved, rubric };
  }
  const presetRaw = (env.SCORING_PRESET ?? "").trim() || "balanced";
  const shipped = SHIPPED[presetRaw];
  if (!shipped) {
    throw new Error(
      `Invalid SCORING_PRESET="${presetRaw}" — expected one of: ${RUBRIC_PRESET_NAMES.join(", ")}. Refusing to start with unknown weights.`,
    );
  }
  const rubric = parseRubric(shipped.data, shipped.source);
  return { name: rubric.name, source: shipped.source, rubric };
}

let cached: ActiveRubric | null = null;

/** Load-once accessor for routes: first call loads, later calls reuse. */
export function getActiveRubric(): ActiveRubric {
  if (!cached) {
    cached = loadActiveRubric(process.env);
  }
  return cached;
}

/** Test-only cache reset so env-mutating tests stay isolated. */
export function resetRubricCache(): void {
  cached = null;
}
