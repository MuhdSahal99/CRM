import { getUser, UpdateUserInput, updateUser } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}) }, async ({ tx, params }) => ({ data: await getUser(tx, params.id!) }));

export const PUT = apiRoute({ input: UpdateUserInput, permission: { user: ["manage"] } }, async ({ tx, params, input }) => ({
  data: await updateUser(tx, params.id!, input),
}));
