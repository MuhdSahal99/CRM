import { CreateExchangeRatesInput, createExchangeRates, ListExchangeRatesInput, listExchangeRates } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: ListExchangeRatesInput, permission: { settings: ["read"] } }, async ({ tx, input }) => listExchangeRates(tx, input));
export const POST = apiRoute({ input: CreateExchangeRatesInput, permission: { settings: ["update"] }, status: 201, idempotent: true }, async ({ tx, input }) => ({ data: await createExchangeRates(tx, input) }));
