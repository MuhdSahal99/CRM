import { sql } from "drizzle-orm";
import type { Tx } from "./tenant.ts";

// T7.03 (ADR-0008): numbers come from document_sequences. The UPDATE runs in the caller's transaction, so a rollback
// returns the number (gap-free). OQ-06: the prefix and start value are config rows an Admin may set; these are the defaults.
export type DocType = "quote" | "sales_order" | "invoice";
const DEFAULT_PREFIX: Record<DocType, string> = { quote: "QT-", sales_order: "SO-", invoice: "INV-" };

/** The next number of `docType` for the current org, as prefix || lpad(n, padding). */
export async function takeNext(tx: Tx, docType: DocType): Promise<string> {
  await tx.execute(sql`INSERT INTO document_sequences (org_id, doc_type, prefix) VALUES (app.org_id(), ${docType}, ${DEFAULT_PREFIX[docType]}) ON CONFLICT DO NOTHING`);
  const { rows } = await tx.execute<{ n: string }>(sql`
    UPDATE document_sequences SET next_value = next_value + 1 WHERE org_id = app.org_id() AND doc_type = ${docType}
    RETURNING prefix || lpad((next_value - 1)::text, padding::int, '0') AS n`);
  return rows[0]!.n;
}
