import rateLimit, { MINUTE, type Options } from 'express-rate-limit';

/**
 * Reads a positive integer from the environment, falling back to the default when
 * the variable is unset or unusable. A typo should not silently disable the limiter.
 */
export const limitFrom = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const WINDOW_MS = 15 * MINUTE;

const shared: Partial<Options> = {
  windowMs: WINDOW_MS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Retry once the window resets.' },
};

/**
 * Caps the write endpoints.
 *
 * Every route here is unauthenticated and both POSTs insert into Atlas, so without a
 * cap anyone who can reach the process can fill a zone-sharded collection as fast as
 * the cluster will accept writes. Authentication is the real answer and is outside
 * what this repository demonstrates; a limiter is the baseline that keeps the demo
 * from being a free write endpoint in the meantime.
 *
 * Writes are tighter than reads because they cost storage that has to be reclaimed,
 * and because a demo has no legitimate high-volume writer.
 */
export const writeLimiter = rateLimit({ ...shared, limit: limitFrom('WRITE_RATE_LIMIT', 60) });

/**
 * Caps the read endpoint. A zone-targeted read is cheap but still a cluster round
 * trip, so this is loose enough for a human clicking around and tight enough to stop
 * a scraper walking the tenant space.
 */
export const readLimiter = rateLimit({ ...shared, limit: limitFrom('READ_RATE_LIMIT', 300) });
