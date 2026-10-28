import { revokeShareLink } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const DELETE = apiRoute({ input: z.object({}), permission: { record: ["update"] } }, async ({ tx, params }) => revokeShareLink(tx, params.module!, params.id!, params.link_id!));
