import { Redis } from "ioredis";

// Each run signs the same seeded users in many times; the per-account sign-in limit (AC-31: 20 per 15 min) would
// otherwise lock them out across back-to-back runs. Clears only the throttle counters, in the dev/CI Redis.
export default async function globalSetup() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not set (root .env.local)");
  const redis = new Redis(process.env.REDIS_URL);
  try {
    const keys = await redis.keys("rate-limit:*");
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}
