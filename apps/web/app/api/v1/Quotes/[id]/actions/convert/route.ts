import { ConvertQuoteInput, convertQuote } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: ConvertQuoteInput, permission: { record: ["create"] }, status: 201, idempotent: true }, async ({ tx, params }) => convertQuote(tx, params.id!));
