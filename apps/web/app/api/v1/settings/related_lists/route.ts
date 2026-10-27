import { listRelatedLists, ModuleName } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({ module: ModuleName }) }, async ({ input }) => ({ data: listRelatedLists(input.module) }));
