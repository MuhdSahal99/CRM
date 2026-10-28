import { log, readObject, resolveShareLink } from "@crm/core";
import { badToken, clientIp, gate } from "@/lib/rate-limit";
import { expired, SECURITY_HEADERS, tooMany } from "@/lib/share-response";

// T9.06, T9.07 (US-14, ADR-0009): the public PDF link. The token is the only credential. Unknown, malformed, expired and revoked tokens get the same
// 404 page, byte for byte, so the page cannot be used to probe which tokens exist. The object is streamed through the app (no presigned URL).
// One access-log line per request carries the link's id, never the token: the `req` serializer logs the path as /s/[redacted] (ADR-0014).

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const started = performance.now();
  const ip = clientIp(request.headers);
  const done = (response: Response, share_link_id?: string) => {
    log.info({ request_id: crypto.randomUUID(), req: request, share_link_id, status: response.status, ms: Math.round(performance.now() - started) }, "request");
    return response;
  };

  const allowed = await gate("share", ip);
  if (!allowed.allowed) return done(tooMany(allowed.retryAfter));
  const { token } = await params; // any query string or fragment is ignored: only the linked file is ever served
  const file = await resolveShareLink(token);
  if (!file) {
    await badToken("share", ip);
    return done(expired());
  }
  try {
    const body = await readObject(file.storage_key);
    return done(new Response(body, { headers: { ...SECURITY_HEADERS, "Content-Type": file.content_type, "Content-Disposition": `inline; filename="${file.filename}"` } }), file.share_link_id);
  } catch (error) {
    log.error({ err: error, share_link_id: file.share_link_id }, "share link file unavailable");
    return done(new Response("Temporarily unavailable", { status: 503, headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" } }), file.share_link_id);
  }
}
