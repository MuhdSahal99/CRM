import type { z } from "zod";

type FieldError = { api_name: string; code: string; message: string };

/** An error the API answers with as-is (ADR-0015 error envelope). Anything else becomes a generic 500. */
export class ApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
    readonly details?: { api_name?: string; errors?: FieldError[] },
  ) {
    super(message);
  }
}

export class Unauthorized extends ApiError {
  constructor() {
    super(401, "AUTHENTICATION_FAILURE", "Sign in to continue.");
  }
}

export class Forbidden extends ApiError {
  constructor() {
    super(403, "NO_PERMISSION", "Your role cannot perform this action.");
  }
}

/** Missing and invisible records get this same, argument-free error, so a 404 reveals nothing (US-02). */
export class NotFound extends ApiError {
  constructor() {
    super(404, "NOT_FOUND", "The record does not exist.");
  }
}

export class Conflict extends ApiError {
  constructor(code: "VERSION_CONFLICT" | "INVALID_STATE" | "IN_PROGRESS", message: string) {
    super(409, code, message);
  }
}

export class PayloadTooLarge extends ApiError {
  constructor() {
    super(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  }
}

/** 422 with one entry per field. A field absent from `input` is MANDATORY_NOT_FOUND, anything else INVALID_DATA. */
export function validationError(error: z.ZodError, input: unknown): ApiError {
  const errors = error.issues.map((issue) => {
    const value = issue.path.reduce<unknown>((v, key) => (v && typeof v === "object" ? (v as Record<PropertyKey, unknown>)[key] : undefined), input);
    return { api_name: issue.path.join("."), code: value === undefined ? "MANDATORY_NOT_FOUND" : "INVALID_DATA", message: issue.message };
  });
  return new ApiError(422, "INVALID_DATA", "Some fields are not valid.", { api_name: errors[0]?.api_name, errors });
}

const MAX_JSON_BYTES = 1024 * 1024; // AC-34; file uploads (CSV import) get their own route and limit

/** Reads a JSON body, refusing more than `maxBytes` even when Content-Length is absent or lies (AC-34). */
export async function readJsonBody(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new PayloadTooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
    size += r.value.byteLength;
    if (size > maxBytes) {
      await reader!.cancel();
      throw new PayloadTooLarge();
    }
    chunks.push(r.value);
  }
  if (size === 0) return {}; // actions such as deactivate take no body
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "MALFORMED_REQUEST", "The request body is not valid JSON.");
  }
}
