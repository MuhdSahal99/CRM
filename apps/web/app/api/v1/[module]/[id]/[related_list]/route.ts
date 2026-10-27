import { listRelated, RelatedInput } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: RelatedInput, permission: { record: ["read"] } }, ({ tx, params, input }) =>
  listRelated(tx, params.module!, params.id!, params.related_list!, input),
);
