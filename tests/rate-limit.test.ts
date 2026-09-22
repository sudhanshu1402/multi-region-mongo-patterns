import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { limitFrom } from '../src/rateLimit';

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

/** Mounts one middleware on a throwaway loopback server and returns its port. */
async function serve(middleware: express.RequestHandler): Promise<number> {
  const app = express();
  app.post('/probe', middleware, (_req, res) => {
    res.status(201).json({ ok: true });
  });
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      server = s;
      resolve((s.address() as { port: number }).port);
    });
  });
}

describe('limitFrom', () => {
  const NAME = 'TEST_RATE_LIMIT_VALUE';
  beforeEach(() => delete process.env[NAME]);
  afterEach(() => delete process.env[NAME]);

  it('uses the fallback when the variable is unset', () => {
    expect(limitFrom(NAME, 60)).toBe(60);
  });

  it('reads a positive integer override', () => {
    process.env[NAME] = '9';
    expect(limitFrom(NAME, 60)).toBe(9);
  });

  // A typo must not silently disable the limiter.
  it.each(['0', '-1', 'sixty', '', '1.5'])('falls back rather than trusting %o', (bad) => {
    process.env[NAME] = bad;
    expect(limitFrom(NAME, 60)).toBe(60);
  });
});

describe('write limiter', () => {
  it('accepts up to the limit, then answers 429 with a JSON body', async () => {
    process.env.WRITE_RATE_LIMIT = '2';
    // The module resolves its limits at import time, so it is imported after the
    // override is in place. That also proves the override reaches rateLimit.
    vi.resetModules();
    const { writeLimiter } = await import('../src/rateLimit');
    const port = await serve(writeLimiter);

    const codes: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`http://127.0.0.1:${port}/probe`, { method: 'POST' });
      codes.push(res.status);
      if (res.status === 429) {
        expect((await res.json()).error).toMatch(/Too many requests/i);
        expect(res.headers.get('ratelimit')).toBeTruthy();
      }
    }

    expect(codes).toEqual([201, 201, 429]);
    delete process.env.WRITE_RATE_LIMIT;
  });
});
