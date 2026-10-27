import { CreateVatRatesInput, createVatRates, listVatRates } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { settings: ["read"] } }, async ({ tx }) => ({ data: await listVatRates(tx) }));
export const POST = apiRoute({ input: CreateVatRatesInput, permission: { settings: ["update"] }, status: 201, idempotent: true }, async ({ tx, input }) => ({ data: await createVatRates(tx, input) }));
