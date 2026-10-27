import { listTimeline, RelatedInput } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: RelatedInput, permission: { record: ["read"] } }, ({ tx, params, input }) => listTimeline(tx, params.module!, params.id!, input));
