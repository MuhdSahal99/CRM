import { TransitionSalesOrderInput, transitionSalesOrder } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: TransitionSalesOrderInput, permission: { record: ["update"] }, idempotent: true }, async ({ tx, input, params }) => transitionSalesOrder(tx, params.id!, input));
