import { addNote, listRelated, NoteInput, NotFound, RelatedInput } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: RelatedInput, permission: { record: ["read"] } }, ({ tx, params, input }) =>
  listRelated(tx, params.module!, params.id!, params.related_list!, input),
);

// Only Notes can be added through a related list; the other lists are created as their own records.
export const POST = apiRoute({ input: NoteInput, permission: { record: ["create"] }, status: 201, idempotent: true }, async ({ tx, params, input }) => {
  if (params.related_list !== "Notes") throw new NotFound();
  return { data: await addNote(tx, params.module!, params.id!, input) };
});
