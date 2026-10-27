import { listModules } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}) }, async ({ tx }) => ({ data: await listModules(tx) }));
