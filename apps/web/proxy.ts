import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Optimistic only (TRD § Request lifecycle): no cookie → sign in. It makes no auth decisions; pages and API routes
// validate the session themselves (resolveContext). Locale needs nothing here while the MVP is English-only
// (i18n/request.ts).
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

// API routes answer 401 themselves; only app pages redirect.
export const config = { matcher: ["/app", "/app/:path*"] };
