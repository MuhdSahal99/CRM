import { getConversionOptions } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { record: ["update"] } }, async ({ tx, params }) => ({ data: await getConversionOptions(tx, params.id!) }));
