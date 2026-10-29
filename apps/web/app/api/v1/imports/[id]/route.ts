import { getImport } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { import: ["run"] } }, async ({ tx, params }) => getImport(tx, params.id!));
