import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * Creates a memory-efficient sliding window rate limiter.
 * @param windowMs Time window in milliseconds (e.g., 60,000 ms = 1 minute)
 * @param max Maximum allowed requests per IP within the window
 */
export function rateLimiter(windowMs: number = 60000, max: number = 30) {
  const store = new Map<string, RateLimitRecord>();

  // Periodically sweep expired entries every 2 minutes
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetAt) {
        store.delete(key);
      }
    }
  }, 120000);

  // Unref so the interval doesn't prevent Node process termination in tests
  if (interval.unref) {
    interval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // In test environment or health checks, skip rate limiting to avoid test interference
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown-client';
    const now = Date.now();
    const record = store.get(ip);

    if (!record || now > record.resetAt) {
      store.set(ip, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    if (record.count >= max) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec.toString());
      return res.status(429).json({
        error: 'Too many requests. Please wait before submitting additional emergency reports.',
        retry_after_seconds: retryAfterSec,
      });
    }

    record.count += 1;
    return next();
  };
}
