import { getDocumentPdf } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { record: ["read"] } }, async ({ tx, params }) => getDocumentPdf(tx, params.module!, params.id!));
