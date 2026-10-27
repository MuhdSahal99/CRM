import {
  type Envelope,
  errorResponse,
  Forbidden,
  type Permission,
  readJsonBody,
  resolveContext,
  roles,
  type TenantContext,
  type Tx,
  Unauthorized,
  validationError,
  withTenant,
} from "@crm/core";
import type { z } from "zod";

type Handler<S extends z.ZodType> = (args: {
  ctx: TenantContext;
  input: z.output<S>;
  params: Record<string, string>;
  tx: Tx;
}) => Promise<Envelope>;

/**
 * Every /api/v1 route handler goes through this (ADR-0015, TRD § Request lifecycle):
 * session → 401, role permission → 403, body cap → 413, Zod → 422 per field, then one withTenant transaction.
 * Input comes from the query string on GET/DELETE and from the JSON body otherwise; unknown keys are stripped.
 */
export function apiRoute<S extends z.ZodType>(options: { input: S; permission?: Permission }, handler: Handler<S>) {
  return async (request: Request, route: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const ctx = await resolveContext(request.headers);
      if (!ctx) throw new Unauthorized();
      if (options.permission && !roles[ctx.role].authorize(options.permission).success) throw new Forbidden();

      const raw = ["GET", "DELETE"].includes(request.method)
        ? Object.fromEntries(new URL(request.url).searchParams)
        : await readJsonBody(request);
      const parsed = options.input.safeParse(raw);
      if (!parsed.success) throw validationError(parsed.error, raw);

      const params = await route.params;
      return Response.json(await withTenant(ctx, (tx) => handler({ ctx, input: parsed.data, params, tx })));
    } catch (error) {
      return errorResponse(error);
    }
  };
}
