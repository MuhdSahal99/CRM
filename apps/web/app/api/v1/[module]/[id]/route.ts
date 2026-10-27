import { deleteRecord, getRecord, UpdateRecordInput, updateRecord } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { record: ["read"] } }, async ({ tx, params }) => ({ data: await getRecord(tx, params.module!, params.id!) }));

export const PUT = apiRoute({ input: UpdateRecordInput, permission: { record: ["update"] } }, async ({ tx, params, input }) => ({
  data: await updateRecord(tx, params.module!, params.id!, input),
}));

export const DELETE = apiRoute({ input: z.object({}), permission: { record: ["delete"] } }, async ({ tx, params }) => ({
  data: await deleteRecord(tx, params.module!, params.id!),
}));
