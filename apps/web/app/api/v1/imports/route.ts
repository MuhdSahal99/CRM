import { createImport, listImports } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { readImportUpload } from "@/lib/upload";

export const GET = apiRoute({ input: z.object({}), permission: { import: ["run"] } }, async ({ tx }) => listImports(tx));

// Multipart: the file is size-capped while it streams. Not idempotent-keyed: the body is the identity, and one running import per org stops a double submit.
export const POST = apiRoute({ input: z.object({}), upload: true, permission: { import: ["run"] }, status: 202 }, async ({ tx, request }) => createImport(tx, await readImportUpload(request)));
