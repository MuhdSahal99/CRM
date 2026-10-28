import {
  type Envelope,
  ApiError,
  errorResponse,
  Forbidden,
  idempotent,
  log,
  NotFound,
  type Permission,
  readJsonBody,
  requestHash,
  resolveContext,
  roles,
  type TenantContext,
  type Tx,
  Unauthorized,
  validationError,
  withTenant,
} from "@crm/core";
import { z } from "zod";

type Handler<S extends z.ZodType> = (args: {
  ctx: TenantContext;
  input: z.output<S>;
  params: Record<string, string>;
  tx: Tx;
}) => Promise<Envelope | Response>; // a Response (a file download) is returned as it is

/**
 * Every /api/v1 route handler goes through this (ADR-0015, TRD § Request lifecycle):
 * session → 401, role permission → 403, body cap → 413, Zod → 422 per field, then one withTenant transaction.
 * Input comes from the query string on GET/DELETE and from the JSON body otherwise; unknown keys are stripped.
 * `idempotent` routes honour an Idempotency-Key header (ADR-0015).
 */
export function apiRoute<S extends z.ZodType>(options: { input: S; permission?: Permission; status?: number; idempotent?: true; redact?: (body: never) => unknown }, handler: Handler<S>) {
  return async (request: Request, route?: { params?: Promise<Record<string, string>> }): Promise<Response> => {
    const started = performance.now();
    let session: TenantContext | null = null;
    let response: Response;
    try {
      const ctx = (session = await resolveContext(request.headers));
      if (!ctx) throw new Unauthorized();
      if (options.permission && !roles[ctx.role].authorize(options.permission).success) throw new Forbidden();

      const raw = ["GET", "DELETE"].includes(request.method)
        ? Object.fromEntries(new URL(request.url).searchParams)
        : await readJsonBody(request);
      const parsed = options.input.safeParse(raw);
      if (!parsed.success) throw validationError(parsed.error, raw);

      const params = (await route?.params) ?? {}; // Next passes no params to a route without dynamic segments
      if (params.id !== undefined && !z.uuid().safeParse(params.id).success) throw new NotFound(); // never reaches SQL
      const run = (tx: Tx) => handler({ ctx, input: parsed.data, params, tx });
      const status = options.status ?? 200;
      const key = options.idempotent && request.headers.get("idempotency-key");
      if (key && (key.length < 8 || key.length > 255)) {
        throw new ApiError(422, "INVALID_DATA", "Idempotency-Key must be 8 to 255 characters.", { api_name: "Idempotency-Key" });
      }
      const result = key
        ? await idempotent(ctx, key, requestHash(request.method, new URL(request.url).pathname, raw), status, run as (tx: Tx) => Promise<Envelope>, undefined, options.redact as (body: unknown) => unknown)
        : { status, body: await withTenant(ctx, run) };
      response = result.body instanceof Response ? result.body : Response.json(result.body, { status: result.status });
    } catch (error) {
      response = errorResponse(error);
    }
    // One line per request (ADR-0014); the req serializer keeps only the method and a redacted path.
    const ms = Math.round(performance.now() - started);
    log.info({ request_id: crypto.randomUUID(), org_id: session?.orgId, user_id: session?.userId, req: request, status: response.status, ms }, "request");
    return response;
  };
}
