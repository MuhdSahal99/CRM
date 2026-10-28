import { CreateShareLinkInput, createShareLink, listShareLinks, parseConfig, redactShareLinks } from "@crm/core";
import { z } from "zod";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: z.object({}), permission: { record: ["read"] } }, async ({ tx, params }) => listShareLinks(tx, params.module!, params.id!));

// The plaintext url is in this response only: the idempotency layer stores it redacted.
export const POST = apiRoute(
  { input: CreateShareLinkInput, permission: { record: ["update"] }, status: 201, idempotent: true, redact: redactShareLinks as (body: never) => unknown },
  async ({ tx, input, params }) => createShareLink(tx, params.module!, params.id!, input, parseConfig(process.env).BETTER_AUTH_URL),
);
