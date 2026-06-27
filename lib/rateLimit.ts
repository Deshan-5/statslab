/**
 * lib/rateLimit.ts
 *
 * Rate limiter supporting:
 * 1. Serverless-safe distributed rate limiting via Upstash Redis REST pipeline if envs are present.
 * 2. Lightweight, in-process rate limiter backed by a Map with memory leak pruning for local dev.
 */

type WindowEntry = {
  count: number;
  resetAt: number; // epoch ms when the window expires
};

const store = new Map<string, WindowEntry>();

// Housekeeping: prune expired entries every 5 minutes so the Map doesn't grow unbounded.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export type RateLimitOptions = {
  /** Max requests allowed per window. */
  limit: number;
  /** Window size in seconds. */
  windowSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfter: number;
};

/**
 * Perform serverless-safe rate limiting using Upstash Redis REST pipeline,
 * or fallback to in-memory store in development.
 */
export async function rateLimit(
  key: string,
  { limit, windowSec }: RateLimitOptions
): Promise<RateLimitResult> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowId = Math.floor(now / windowMs);
  const redisKey = `ratelimit:${key}:${windowId}`;

  // 1. If Redis is configured, run serverless-safe rate limiting over HTTP REST pipeline
  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["EXPIRE", redisKey, windowSec * 2],
        ]),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data[0] && typeof data[0].result === "number") {
          const count = data[0].result;
          const remaining = Math.max(0, limit - count);
          const nextWindowResetMs = (windowId + 1) * windowMs;
          const retryAfter = Math.ceil((nextWindowResetMs - Date.now()) / 1000);

          return {
            allowed: count <= limit,
            remaining,
            retryAfter: count > limit ? retryAfter : 0,
          };
        }
      }
    } catch (err) {
      console.warn("Upstash Rate Limiting failed, falling back to memory cache:", err);
    }
  }

  // 2. Fallback to in-process memory Map (useful for local dev / offline mode)
  const existing = store.get(key);

  if (!existing || existing.resetAt < now) {
    const entry: WindowEntry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count++;
  const remaining = Math.max(0, limit - existing.count);
  const retryAfter = Math.ceil((existing.resetAt - now) / 1000);

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining, retryAfter: 0 };
}
