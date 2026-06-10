import { describe, it, expect } from 'vitest';
import { User } from '../src/models/user';
import { Tenant } from '../src/models/tenant';

// validateSync() runs Mongoose schema validation without a DB connection, so
// these assert the data-residency constraints (the region enum is the shard
// key) and required fields purely.
describe('User schema (data residency)', () => {
  it('accepts a valid EU user', () => {
    expect(new User({ email: 'a@b.com', tenantId: 't1', region: 'EU' }).validateSync()).toBeUndefined();
  });

  it('rejects a region outside the allowed zones', () => {
    const err = new User({ email: 'a@b.com', tenantId: 't1', region: 'MARS' as any }).validateSync();
    expect(err?.errors?.region).toBeDefined();
  });

  it('requires email and tenantId', () => {
    const err = new User({ region: 'USA' } as any).validateSync();
    expect(err?.errors?.email).toBeDefined();
    expect(err?.errors?.tenantId).toBeDefined();
  });

  it('defaults role to member', () => {
    expect(new User({ email: 'a@b.com', tenantId: 't1', region: 'KSA' }).role).toBe('member');
  });
});

describe('Tenant schema', () => {
  it('accepts a valid tenant', () => {
    expect(new Tenant({ tenantId: 't1', name: 'Acme', region: 'USA' }).validateSync()).toBeUndefined();
  });

  it('rejects an invalid region', () => {
    const err = new Tenant({ tenantId: 't1', name: 'Acme', region: 'XX' as any }).validateSync();
    expect(err?.errors?.region).toBeDefined();
  });
});
