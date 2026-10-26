# ADR-0009: Secure, expiring PDF share links for WhatsApp

## Status
Accepted

## Date
2026-10-27

## Context
US-14: Send on WhatsApp opens `wa.me/<E.164>?text=…` with a link to the PDF. Opening that link:
- needs no sign-in,
- reaches exactly one PDF,
- expires after 7 days,
- can be revoked,
- shows a "link expired" page once expired or revoked.

WhatsApp link previews and forwarding mean the URL will be seen by third parties.

## Decision
- **Token.** 32 bytes from `crypto.randomBytes`, base64url (43 chars, 256 bits). We store only `token_hash = sha256(token)` and never the token itself. The plaintext is returned once, in the create response.
- **Row.** `share_links(org_id, file_id, record_type, record_id, token_hash UNIQUE, expires_at, revoked_at, revoked_by, created_by, last_accessed_at, access_count)`.
  - `file_id` points to **one immutable `files` row**, the PDF version that was shared.
  - Re-rendering creates a new file and needs a new link.
- **Expiry.** `expires_at = now() + interval '7 days'`. The 7 days is an org setting with a hard ceiling of 30.
- **Public route.** `GET /s/{token}` is outside `/api/v1`.
  1. Validate the format (`^[A-Za-z0-9_-]{43}$`) before any DB work.
  2. Call `public.resolve_share_link(token_hash bytea)`. It is a `SECURITY DEFINER` function owned by `crm_owner`, with `SET search_path = pg_catalog, public`. It returns only `(org_id, storage_key, filename, content_type)`, and only when the link is not revoked and not expired. It also bumps `access_count` and `last_accessed_at`.
  3. Stream the object from S3 through the app. The client never gets a presigned URL (ADR-0012).
  4. Unknown, expired and revoked tokens all render the **same** "link expired" page with status 404, in constant shape, so the page can't be used to probe which tokens exist.
- **Response headers.**
  - `Cache-Control: no-store, private`
  - `X-Robots-Tag: noindex, nofollow`
  - `Referrer-Policy: no-referrer`
  - `Content-Disposition: inline; filename="<doc-number>.pdf"`
  - `X-Content-Type-Options: nosniff`
  - CSP `default-src 'none'`
- **Rate limit.** Per IP on `/s/*` (Redis-backed), e.g. 30 requests/min. Repeated bad tokens trip a longer block.
- **Logging.** The access log records `share_link_id` and **never the raw token**. The `/s/{token}` path is redacted in request logs and traces (ADR-0014).
- **Revoke.** `DELETE /{Module}/{id}/share_links/{link_id}` sets `revoked_at`. It takes effect on the next request, because no response is ever cached.
- **Activity.** Clicking Send on WhatsApp logs an activity "WhatsApp link shared". This records only that the link was shared, not that the message was delivered.

## Alternatives considered
- **Signed URLs (HMAC, JWT) with embedded expiry.** Cannot be revoked without a denylist, and the key rotation story is worse. Rejected.
- **S3 presigned URLs.** Exposes the bucket hostname, caps at 7 days on SigV4, and cannot be revoked. Rejected.

## Consequences
- Every hit touches the DB. That is cheap: a unique-index lookup.
- A WhatsApp link-preview bot fetch counts as an access. That is acceptable, and the PDF is the intended content.
