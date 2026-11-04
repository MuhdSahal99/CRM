import { Redis } from "ioredis";

/**
 * The sign-in limit (AC-31: 20 per account per 15 min) is per account, and the seeded users sign in many times per run,
 * so the counters are cleared before the run and before every spec. Clears only the throttle counters, in the dev/CI Redis.
 */
export async function clearThrottle() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not set (root .env.local)");
  const redis = new Redis(process.env.REDIS_URL);
  try {
    const keys = await redis.keys("rate-limit:*");
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}

export default clearThrottle;
