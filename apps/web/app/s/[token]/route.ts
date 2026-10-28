import { log, readObject, resolveShareLink } from "@crm/core";
import { expired, SECURITY_HEADERS } from "@/lib/share-response";

// T9.06 (US-14, ADR-0009): the public PDF link. The token is the only credential. Unknown, malformed, expired and revoked tokens get the same
// 404 page, byte for byte, so the page cannot be used to probe which tokens exist. The object is streamed through the app (no presigned URL).

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; // any query string or fragment is ignored: only the linked file is ever served
  const file = await resolveShareLink(token);
  if (!file) return expired();
  try {
    const body = await readObject(file.storage_key);
    log.info({ share_link_id: file.share_link_id }, "share link opened"); // the id, never the token
    return new Response(body, {
      headers: { ...SECURITY_HEADERS, "Content-Type": file.content_type, "Content-Disposition": `inline; filename="${file.filename}"` },
    });
  } catch (error) {
    log.error({ err: error, share_link_id: file.share_link_id }, "share link file unavailable");
    return new Response("Temporarily unavailable", { status: 503, headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" } });
  }
}
