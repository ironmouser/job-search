interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const tracker = new Map<string, RateLimitRecord>();

// Proactively evict expired entries every 5 minutes so the Map never grows
// unbounded in the long-lived Railway process.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of tracker.entries()) {
      if (now > v.resetTime) tracker.delete(k);
    }
  }, 5 * 60 * 1000).unref?.(); // .unref() so the timer doesn't prevent process exit
}

/**
 * Basic memory rate limiter by IP address or key.
 * @param key Unique key (e.g. IP address)
 * @param maxHits Maximum allowed hits within window
 * @param windowMs Window duration in milliseconds (default 15 mins)
 */
export function isRateLimited(
  key: string,
  maxHits: number = 5,
  windowMs: number = 15 * 60 * 1000
): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = tracker.get(key);

  // Clean up old entries occasionally if tracker gets large
  if (tracker.size > 10000) {
    for (const [k, v] of tracker.entries()) {
      if (now > v.resetTime) {
        tracker.delete(k);
      }
    }
  }

  if (!record || now > record.resetTime) {
    tracker.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (record.count >= maxHits) {
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
    return { limited: true, retryAfterSeconds };
  }

  record.count += 1;
  return { limited: false, retryAfterSeconds: 0 };
}
