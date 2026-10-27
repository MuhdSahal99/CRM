import { TransferInput, transferRecords } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: TransferInput, permission: { user: ["manage"] }, idempotent: true }, async ({ tx, params, input }) => ({
  data: await transferRecords(tx, params.id!, input),
}));
