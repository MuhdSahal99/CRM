import { requestEmail, SendEmailInput } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute({ input: SendEmailInput, permission: { record: ["update"] }, status: 202, idempotent: true }, async ({ tx, input, params }) => requestEmail(tx, params.module!, params.id!, input));
