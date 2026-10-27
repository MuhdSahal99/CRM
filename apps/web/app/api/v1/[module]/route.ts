import { CreateRecordsInput, createRecords } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: CreateRecordsInput, permission: { record: ["create"] }, status: 201, idempotent: true }, async ({ tx, ctx, params, input }) => ({
  data: await createRecords(tx, ctx, params.module!, input),
}));
