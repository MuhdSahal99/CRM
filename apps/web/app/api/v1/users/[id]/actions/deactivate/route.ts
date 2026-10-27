import { deactivateUser } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: z.object({}), permission: { user: ["manage"] } }, async ({ tx, ctx, params }) => ({
  data: await deactivateUser(tx, ctx, params.id!),
}));
