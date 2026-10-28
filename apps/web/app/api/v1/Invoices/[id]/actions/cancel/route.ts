import { CancelInvoiceInput, cancelInvoice } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: CancelInvoiceInput, permission: { record: ["update"] }, idempotent: true }, async ({ tx, input, params }) => cancelInvoice(tx, params.id!, input));
