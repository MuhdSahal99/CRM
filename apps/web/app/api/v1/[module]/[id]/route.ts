import { getRecord } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { record: ["read"] } }, async ({ tx, params }) => ({ data: await getRecord(tx, params.module!, params.id!) }));
