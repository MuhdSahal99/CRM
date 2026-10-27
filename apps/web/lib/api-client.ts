/** Browser → /api/v1 with the session cookie. Returns the status and parsed JSON (the API always answers JSON). */
export async function callApi(method: "GET" | "POST" | "PUT", path: string, body?: unknown) {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

type FieldError = { api_name?: string; message?: string };

/** Field → message from a 422 (details.errors) or a failed write outcome (details.api_name); keys are the last path segment. */
export function fieldErrors(errors: FieldError[]): Record<string, string> {
  return Object.fromEntries(errors.filter((e) => e.api_name).map((e) => [e.api_name!.split(".").pop()!, e.message ?? ""]));
}
