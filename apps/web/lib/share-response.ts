// T9.06 (ADR-0009): what every answer on the public /s/* path has in common. Kept out of the route file, which may export only handlers.

export const SECURITY_HEADERS = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
} as const;

const EXPIRED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Link expired</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;min-height:100vh;place-items:center;padding:16px;text-align:center;color:#111;background:#fff}@media(prefers-color-scheme:dark){body{color:#eee;background:#111}}</style></head><body><main><h1>This link has expired</h1><p>Ask the sender for a new link.</p></main></body></html>`;

/** The one response every bad, expired or revoked token gets. */
export const expired = () => new Response(EXPIRED, { status: 404, headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" } });


/** Over the per-IP limit (T9.07): says nothing about any token. */
export const tooMany = (retryAfter: number) =>
  new Response("Too many requests", { status: 429, headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(retryAfter) } });
