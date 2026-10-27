import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";
import "../src/index"; // loads every shared schema, so each `.meta({ id })` lands in z.globalRegistry

// T1.15: a shared Zod schema registered with `.meta({ id: "<Component>" })` must match
// docs/openapi.yaml components.schemas.<Component>. New schemas are picked up automatically.

type Schema = Record<string, any>;
type Resolve = (ref: string) => Schema | undefined;

const ALWAYS = ["type", "enum", "const", "format"];
const BOUNDS = ["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minItems", "maxItems"];

/** $ref → target, and Zod's nullable `anyOf: [x, {type: "null"}]` → OpenAPI 3.1's `type: [x, "null"]`. */
function normalize(schema: Schema, resolve: Resolve): Schema {
  if (schema.$ref) return normalize(resolve(schema.$ref) ?? {}, resolve);
  const anyOf: Schema[] | undefined = schema.anyOf;
  if (anyOf?.length === 2 && anyOf.some((s) => s.type === "null")) {
    const inner = normalize(anyOf.find((s) => s.type !== "null")!, resolve);
    return { ...inner, type: [inner.type, "null"].flat() };
  }
  return schema;
}

const same = (a: unknown, b: unknown) => JSON.stringify([a].flat().sort()) === JSON.stringify([b].flat().sort());
// z.int() emits ±MAX_SAFE_INTEGER bounds that no spec writes down.
const bound = (v: unknown) => (Math.abs(v as number) === Number.MAX_SAFE_INTEGER ? undefined : v);

/** Differences between a Zod input schema and its OpenAPI component; readOnly (server-computed) spec fields are not inputs. */
function drift(zodIn: Schema, specIn: Schema, resolveZod: Resolve, resolveSpec: Resolve, at = "$"): string[] {
  const zod = normalize(zodIn, resolveZod);
  const spec = normalize(specIn, resolveSpec);
  const out: string[] = [];
  for (const key of [...ALWAYS, ...BOUNDS]) {
    const [a, b] = BOUNDS.includes(key) ? [bound(zod[key]), bound(spec[key])] : [zod[key], spec[key]];
    if (!same(a, b)) out.push(`${at}.${key}: zod ${JSON.stringify(a)} vs spec ${JSON.stringify(b)}`);
  }
  // Zod derives patterns for formats (uuid, email); only a pattern the spec states is part of the contract.
  if (spec.pattern !== undefined && zod.pattern !== spec.pattern) out.push(`${at}.pattern: zod ${zod.pattern} vs spec ${spec.pattern}`);
  if (zod.items || spec.items) out.push(...drift(zod.items ?? {}, spec.items ?? {}, resolveZod, resolveSpec, `${at}[]`));

  if (zod.properties || spec.properties) {
    const specProps = Object.entries<Schema>(spec.properties ?? {}).filter(([, s]) => !normalize(s, resolveSpec).readOnly);
    const zodProps: Schema = zod.properties ?? {};
    for (const [name, s] of specProps) {
      if (!(name in zodProps)) out.push(`${at}.${name}: in spec, missing from zod`);
      else out.push(...drift(zodProps[name], s, resolveZod, resolveSpec, `${at}.${name}`));
    }
    for (const name of Object.keys(zodProps)) if (!specProps.some(([n]) => n === name)) out.push(`${at}.${name}: in zod, missing from spec`);
    const writable = new Set(specProps.map(([n]) => n));
    const specRequired = (spec.required ?? []).filter((n: string) => writable.has(n));
    if (!same(zod.required ?? [], specRequired)) out.push(`${at}.required: zod ${JSON.stringify(zod.required ?? [])} vs spec ${JSON.stringify(specRequired)}`);
  }
  return out;
}

const components: Record<string, Schema> = parse(readFileSync(new URL("../../../docs/openapi.yaml", import.meta.url), "utf8")).components.schemas;
const resolveSpec: Resolve = (ref) => components[ref.split("/").pop()!];

describe("OpenAPI drift (T1.15, ADR-0015)", () => {
  it("every registered shared schema matches its components.schemas entry", () => {
    const { schemas } = z.toJSONSchema(z.globalRegistry, { io: "input" });
    const resolveZod: Resolve = (ref) => schemas[ref.split("/").pop()!];
    for (const [id, schema] of Object.entries(schemas)) {
      expect(components[id], `components.schemas.${id} is missing from docs/openapi.yaml`).toBeDefined();
      expect({ id, drift: drift(schema, components[id]!, resolveZod, resolveSpec) }).toEqual({ id, drift: [] });
    }
  });

  it("fails on a deliberately mismatched schema", () => {
    const spec = {
      type: "object",
      required: ["Last_Name"],
      properties: {
        id: { type: "string", format: "uuid", readOnly: true },
        Last_Name: { type: "string", maxLength: 80 },
        Email: { type: ["string", "null"], format: "email" },
        Amount: { $ref: "#/components/schemas/Money" },
      },
    };
    const toJson = (s: z.ZodType) => z.toJSONSchema(s, { io: "input" }) as Schema;
    const noZodRefs: Resolve = () => undefined;
    const money = z.string().regex(new RegExp(components.Money!.pattern));

    const matching = z.object({ Last_Name: z.string().max(80), Email: z.email().nullable().optional(), Amount: money.optional() });
    expect(drift(toJson(matching), spec, noZodRefs, resolveSpec)).toEqual([]);

    const mismatched = z.object({ Last_Name: z.string().max(100), Email: z.int().optional(), Extra: z.string() });
    expect(drift(toJson(mismatched), spec, noZodRefs, resolveSpec)).toEqual([
      "$.Last_Name.maxLength: zod 100 vs spec 80",
      '$.Email.type: zod "integer" vs spec ["string","null"]',
      '$.Email.format: zod undefined vs spec "email"',
      "$.Amount: in spec, missing from zod",
      "$.Extra: in zod, missing from spec",
      '$.required: zod ["Last_Name","Extra"] vs spec ["Last_Name"]',
    ]);
  });
});
