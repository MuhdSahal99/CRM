import { ConvertSalesOrderInput, convertSalesOrder } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: ConvertSalesOrderInput, permission: { record: ["create"] }, status: 201, idempotent: true }, async ({ tx, params }) => convertSalesOrder(tx, params.id!));
