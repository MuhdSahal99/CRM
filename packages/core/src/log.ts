import { pino, type DestinationStream } from "pino";

// ADR-0014: these keys never reach a log line, at the top level or one object down (e.g. `headers.cookie`).
const SECRET_KEYS = ["password", "token", "authorization", "cookie", "email", "mobile", "phone"];

/** A share-link path carries its bearer token (ADR-0009): `/s/<token>` is logged as `/s/[redacted]`. */
export const redactPath = (path: string) => path.replace(/^\/s\/[^/?#]*/, "/s/[redacted]");

/** JSON logs to stdout (ADR-0014). `destination` is for tests. */
export function createLogger(destination?: DestinationStream) {
  return pino(
    {
      redact: { paths: SECRET_KEYS.flatMap((key) => [key, `*.${key}`]), censor: "[redacted]" },
      serializers: {
        // Method and path only: no headers (cookies, auth) and no query string (may carry PII).
        req: (req: Request) => ({ method: req.method, path: redactPath(new URL(req.url).pathname) }),
        // Never the message: Drizzle puts query params there, and pg messages and details can quote values (PII).
        err: (err: Error & { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } }) => ({
          type: err.constructor?.name,
          code: err.code ?? err.cause?.code,
          constraint: err.constraint ?? err.cause?.constraint,
          stack: err.stack?.split("\n").filter((line) => line.startsWith("    at ")).join("\n"),
        }),
      },
    },
    destination,
  );
}

export const log = createLogger();
