import { CreateRecordsInput, createRecords, ListRecordsInput, listRecords } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: ListRecordsInput, permission: { record: ["read"] } }, ({ tx, ctx, params, input }) => listRecords(tx, ctx, params.module!, input));

export const POST = apiRoute({ input: CreateRecordsInput, permission: { record: ["create"] }, status: 201, idempotent: true }, async ({ tx, ctx, params, input }) => ({
  data: await createRecords(tx, ctx, params.module!, input),
}));
