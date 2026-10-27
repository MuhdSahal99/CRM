import { type SQL, sql } from "drizzle-orm";
import { ApiError } from "../http/errors.ts";

// Zoho search criteria (ADR-0015), e.g. ((Email:equals:x@y.com)and(Stage:starts_with:Neg)). Parsed into an AST with an
// allowlist of fields and operators; compiling it only ever emits identifiers chosen by the caller and bind parameters.

const OPS = ["equals", "not_equal", "starts_with", "in", "between", "greater_than", "less_than"] as const;
type Op = (typeof OPS)[number];
export type Criteria = { field: string; op: Op; value: string | string[] } | { and: Criteria[] } | { or: Criteria[] };

const MAX_DEPTH = 10; // AC-34

const fail = (message: string): never => {
  throw new ApiError(422, "INVALID_QUERY", message, { api_name: "criteria" });
};

export function parseCriteria(input: string, fields: ReadonlySet<string>): Criteria {
  let i = 0;
  const peek = () => input[i];
  const expect = (c: string) => (input[i] === c ? i++ : fail(`Expected "${c}" at position ${i + 1}.`));
  const spaces = () => {
    while (input[i] === " ") i++;
  };

  // group := "(" (condition | expr) ")"
  function group(depth: number): Criteria {
    if (depth > MAX_DEPTH) fail("The criteria are nested too deeply.");
    expect("(");
    const node = peek() === "(" ? expr(depth) : condition();
    expect(")");
    return node;
  }

  // expr := group (("and" | "or") group)*, one operator per level: mixing needs parentheses.
  function expr(depth: number): Criteria {
    const items = [group(depth + 1)];
    let joiner: "and" | "or" | undefined;
    for (;;) {
      spaces();
      const word = /^(and|or)/i.exec(input.slice(i))?.[0].toLowerCase() as "and" | "or" | undefined;
      if (!word) break;
      if (joiner && joiner !== word) fail("Use parentheses to combine and with or.");
      joiner = word;
      i += word.length;
      spaces();
      items.push(group(depth + 1));
    }
    return joiner ? ({ [joiner]: items } as Criteria) : items[0]!;
  }

  // condition := field ":" op ":" value; value ends at an unescaped ")", with \( \) \, \\ escapes.
  function condition(): Criteria {
    const field = /^\w+/.exec(input.slice(i))?.[0] ?? fail("Expected a field name.");
    if (!fields.has(field)) fail(`Unknown field "${field.slice(0, 60)}".`);
    i += field.length;
    expect(":");
    const op = (/^\w+/.exec(input.slice(i))?.[0] ?? "") as Op;
    if (!OPS.includes(op)) fail("Unknown operator.");
    i += op.length;
    expect(":");
    const parts: string[] = [""];
    for (; i < input.length && input[i] !== ")"; i++) {
      if (input[i] === "\\" && i + 1 < input.length) parts.push(parts.pop()! + input[++i]);
      else if (input[i] === "," && (op === "in" || op === "between")) parts.push("");
      else if (input[i] === "(") fail("Escape ( in a value as \\(.");
      else parts.push(parts.pop()! + input[i]);
    }
    if (op === "between" && parts.length !== 2) fail("between takes two values.");
    if (parts.length > 100) fail("Too many values.");
    return { field, op, value: op === "in" || op === "between" ? parts : parts[0]! };
  }

  const tree = group(1);
  if (i !== input.length) fail(`Unexpected text at position ${i + 1}.`);
  return tree;
}

const like = (v: string) => `${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** AST → SQL. `column` maps an allowlisted field to its SQL; values are parameters, never text. */
export function compileCriteria(node: Criteria, column: (field: string) => SQL): SQL {
  if ("and" in node) return sql`(${sql.join(node.and.map((n) => compileCriteria(n, column)), sql` AND `)})`;
  if ("or" in node) return sql`(${sql.join(node.or.map((n) => compileCriteria(n, column)), sql` OR `)})`;
  const c = column(node.field);
  const v = node.value;
  switch (node.op) {
    case "equals": return sql`${c} = ${v}`;
    case "not_equal": return sql`${c} IS DISTINCT FROM ${v}`;
    case "starts_with": return sql`${c} ILIKE ${like(v as string)}`;
    case "in": return sql`${c} IN ${v}`;
    case "between": return sql`${c} BETWEEN ${v[0]} AND ${v[1]}`;
    case "greater_than": return sql`${c} > ${v}`;
    case "less_than": return sql`${c} < ${v}`;
  }
}
