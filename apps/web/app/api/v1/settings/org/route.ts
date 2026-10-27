import { getOrgSettings, UpdateOrgSettingsInput, updateOrgSettings } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { settings: ["read"] } }, async ({ tx }) => ({ data: await getOrgSettings(tx) }));
export const PUT = apiRoute({ input: UpdateOrgSettingsInput, permission: { settings: ["update"] } }, async ({ tx, input }) => ({ data: await updateOrgSettings(tx, input) }));
