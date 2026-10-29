import { importErrorsCsv } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

// The failed rows as a CSV download; every cell is escaped against formula injection (AC-55).
export const GET = apiRoute({ input: z.object({}), permission: { import: ["run"] } }, async ({ tx, params }) =>
  new Response(await importErrorsCsv(tx, params.id!), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-${params.id}-errors.csv"`, "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
  }),
);
