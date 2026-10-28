import { IssueInvoiceInput, issueInvoice } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: IssueInvoiceInput, permission: { record: ["update"] }, idempotent: true }, async ({ tx, params }) => issueInvoice(tx, params.id!));
