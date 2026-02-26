export type RateLimitStore = Map<string, number[]>;

export type RateLimitResult = {
  result: boolean;
  remaining: number;
  retryAfterMs: number;
  limitCount: number;
  limitWindowMs: number;
};

type RateLimitParams = {
  buckets: RateLimitStore;
  key: string;
  limitCount: number;
  limitWindowMs: number;
  now?: number;
};

export function ratelimit({
  buckets,
  key,
  limitCount,
  limitWindowMs,
  now = Date.now(),
}: RateLimitParams): RateLimitResult {
  const cutoff = now - limitWindowMs;
  const bucket = (buckets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (bucket.length >= limitCount) {
    const oldest = bucket[0];
    const retryAfterMs = Math.max(0, limitWindowMs - (now - oldest));
    buckets.set(key, bucket);
    return {
      result: false,
      remaining: 0,
      retryAfterMs,
      limitCount,
      limitWindowMs,
    };
  }

  bucket.push(now);
  buckets.set(key, bucket);

  return {
    result: true,
    remaining: Math.max(0, limitCount - bucket.length),
    retryAfterMs: 0,
    limitCount,
    limitWindowMs,
  };
}
