import { confirmImport } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: z.object({}), permission: { import: ["run"] }, status: 202, idempotent: true }, async ({ tx, params }) => confirmImport(tx, params.id!));
