import { log, redis } from "@crm/core";

// T9.07 (ADR-0009, AC-02): Redis fixed-window limits per client IP for the two public, token-only entry points: /s/{token} and the
// accept-invite page and action. A burst is capped per minute, and a run of bad tokens blocks the IP for longer. Tokens are 256 bits, so this
// is defence in depth, not the secret: if Redis is down the limiter logs and lets the request through rather than taking the pages down.

/** The client address as the reverse proxy set it: the right-most X-Forwarded-For entry (the proxy must overwrite or append, PRODUCTION_READINESS). */
export function clientIp(headers: Headers): string {
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops.at(-1) ?? "unknown";
}

type Rule = { window: number; max: number };
export type Gate = { allowed: true } | { allowed: false; retryAfter: number };

/** Counts one hit in a fixed window, atomically (one MULTI: increment, start the window on the first hit, read what is left of it). */
async function hit(key: string, { window, max }: Rule): Promise<Gate> {
  const replies = await redis().multi().incr(key).expire(key, window, "NX").ttl(key).exec();
  if (!replies || replies.some(([error]) => error)) throw new Error("Rate-limit store unavailable");
  const count = replies[0]![1] as number;
  return count <= max ? { allowed: true } : { allowed: false, retryAfter: Math.max(replies[2]![1] as number, 1) };
}

const POLICY = {
  share: { burst: { window: 60, max: 30 }, badTokens: { window: 600, max: 10 }, blockSeconds: 900 },
  invite: { burst: { window: 60, max: 10 }, badTokens: { window: 900, max: 5 }, blockSeconds: 900 },
} as const;
export type Scope = keyof typeof POLICY;

/** Call first on every request to the scope. Counts the request, and refuses it if the IP is over the burst limit or blocked for bad tokens. */
export async function gate(scope: Scope, ip: string): Promise<Gate> {
  try {
    const blocked = await redis().ttl(`rl:${scope}:block:${ip}`);
    if (blocked > 0) return { allowed: false, retryAfter: blocked };
    const result = await hit(`rl:${scope}:burst:${ip}`, POLICY[scope].burst);
    if (!result.allowed) log.warn({ scope, ip }, "rate limited");
    return result;
  } catch (error) {
    log.error({ err: error, scope }, "rate limiter unavailable; letting the request through");
    return { allowed: true };
  }
}

/** Call when a token turned out not to exist or to be spent. Too many in a row blocks the IP for a while. */
export async function badToken(scope: Scope, ip: string): Promise<void> {
  try {
    const { badTokens, blockSeconds } = POLICY[scope];
    if (!(await hit(`rl:${scope}:bad:${ip}`, badTokens)).allowed) {
      await redis().set(`rl:${scope}:block:${ip}`, "1", "EX", blockSeconds);
      log.warn({ scope, ip }, "ip blocked after repeated bad tokens");
    }
  } catch (error) {
    log.error({ err: error, scope }, "rate limiter unavailable");
  }
}
