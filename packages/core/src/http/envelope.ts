import { log } from "../log";
import { ApiError } from "./errors";

export type Info = { page: number; per_page: number; count: number; more_records: boolean };

/** Success envelope (ADR-0015): `data` is always an array, even for one record; `info` only on lists. */
export type Envelope = { data: unknown[]; info?: Info };

export function errorResponse(error: unknown): Response {
  if (!(error instanceof ApiError)) {
    // Never echo the error to the client.
    log.error({ err: error }, "unhandled error");
    error = new ApiError(500, "INTERNAL_ERROR", "Something went wrong. Try again.");
  }
  const { httpStatus, code, message, details } = error as ApiError;
  return Response.json({ code, message, ...(details && { details }), status: "error" }, { status: httpStatus });
}
