import { SearchInput, searchRecords } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: SearchInput, permission: { record: ["read"] } }, ({ tx, params, input }) => searchRecords(tx, params.module!, input));
