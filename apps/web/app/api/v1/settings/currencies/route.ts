import { listCurrencies } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { settings: ["read"] } }, async ({ tx }) => ({ data: await listCurrencies(tx) }));
