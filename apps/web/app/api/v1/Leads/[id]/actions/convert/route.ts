import { ConvertLeadInput, convertLead } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: ConvertLeadInput, permission: { record: ["update"] }, idempotent: true }, async ({ tx, ctx, input, params }) => ({
  data: await convertLead(tx, ctx, params.id!, input),
}));
