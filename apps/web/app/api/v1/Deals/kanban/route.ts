import { getKanban, KanbanInput } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: KanbanInput, permission: { record: ["read"] } }, async ({ tx, input }) => ({ data: await getKanban(tx, input) }));
