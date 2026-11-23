import { AppError } from '@erp/shared';
import type { RequestHandler } from 'express';

/** ADR 0018 section 4, step 7: at most 20 login attempts per IP per 15 minutes. */
const MAX_ATTEMPTS = 20;
const WINDOW_MS = 15 * 60_000;
/** Forget idle IPs now and then, so the map doesn't grow without bound. */
const SWEEP_EVERY = 1_000;

/**
 * The per-IP login limiter, in process (one API instance, ADR 0003; it moves to Redis before a second instance).
 * A sliding window: an attempt counts for 15 minutes. Refused attempts don't count, so the limit lifts 15 minutes
 * after the 20th allowed attempt.
 */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private calls = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Records an attempt from `ip` and says whether it may go ahead. */
  allow(ip: string): boolean {
    const now = this.now();
    if ((this.calls += 1) % SWEEP_EVERY === 0) this.sweep(now);
    const recent = (this.attempts.get(ip) ?? []).filter((at) => at > now - WINDOW_MS);
    if (recent.length >= MAX_ATTEMPTS) {
      this.attempts.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.attempts.set(ip, recent);
    return true;
  }

  private sweep(now: number): void {
    for (const [ip, times] of this.attempts) {
      if (times.every((at) => at <= now - WINDOW_MS)) this.attempts.delete(ip);
    }
  }
}

/** The route middleware: 429 RATE_LIMITED once an IP has used its attempts. */
export function loginRateLimit(limiter: LoginRateLimiter): RequestHandler {
  return (req, _res, next) => {
    if (limiter.allow(req.ip ?? 'unknown')) {
      next();
      return;
    }
    next(new AppError('RATE_LIMITED', 'Too many login attempts. Try again later.'));
  };
}
