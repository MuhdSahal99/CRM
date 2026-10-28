import { MarkPaidInput, markInvoicePaid } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: MarkPaidInput, permission: { record: ["update"] }, idempotent: true }, async ({ tx, input, params }) => markInvoicePaid(tx, params.id!, input));
