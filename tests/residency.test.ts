import { describe, it, expect } from 'vitest';
import { checkUserResidency } from '../src/residency';

// checkUserResidency is the write-time data-residency decision for POST /users:
// a user may only be created in the region its tenant is pinned to. This guards
// against placing a record in a zone that violates the tenant's residency.
describe('checkUserResidency (write-time residency guard)', () => {
  it('allows a user whose region matches its tenant', () => {
    expect(checkUserResidency({ region: 'EU' }, 'EU')).toEqual({ ok: true });
  });

  it('rejects with 404 when the tenant does not exist', () => {
    expect(checkUserResidency(null, 'EU')).toEqual({
      ok: false,
      status: 404,
      error: 'tenant not found',
    });
    expect(checkUserResidency(undefined, 'EU').status).toBe(404);
  });

  it('rejects with 409 on a region mismatch (residency violation)', () => {
    const res = checkUserResidency({ region: 'USA' }, 'EU');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(res.error).toContain('data residency violation');
  });

  it('treats a missing user region as a mismatch, not a pass', () => {
    expect(checkUserResidency({ region: 'KSA' }, undefined).ok).toBe(false);
  });
});
