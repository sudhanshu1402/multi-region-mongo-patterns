import { describe, it, expect } from 'vitest';
import { User } from '../src/models/user';
import { Tenant } from '../src/models/tenant';

// validateSync() runs Mongoose schema validation without a DB connection, so
// these assert the data-residency constraints (the region enum is the shard
// key) and required fields purely. No mongoose.connect is ever called.

const ALLOWED_REGIONS = ['EU', 'USA', 'KSA'] as const;

describe('User schema (data residency)', () => {
  it('accepts a valid user in every allowed region', () => {
    for (const region of ALLOWED_REGIONS) {
      const err = new User({ email: 'a@b.com', tenantId: 't1', region }).validateSync();
      expect(err).toBeUndefined();
    }
  });

  it('rejects a region outside the allowed zones', () => {
    const err = new User({ email: 'a@b.com', tenantId: 't1', region: 'MARS' as any }).validateSync();
    expect(err?.errors?.region).toBeDefined();
  });

  it('requires email, tenantId and region', () => {
    const err = new User({} as any).validateSync();
    expect(err?.errors?.email).toBeDefined();
    expect(err?.errors?.tenantId).toBeDefined();
    expect(err?.errors?.region).toBeDefined();
  });

  it('defaults role to member when omitted', () => {
    expect(new User({ email: 'a@b.com', tenantId: 't1', region: 'KSA' }).role).toBe('member');
  });

  it('declares the region-leading compound shard key as unique', () => {
    // The shard key is { region: 1, tenantId: 1, email: 1 }. region MUST lead so
    // that targeted reads hit a single zone instead of scatter-gathering.
    const indexes = User.schema.indexes();
    const shardIndex = indexes.find((entry) => entry[0].region === 1);
    expect(shardIndex).toBeDefined();
    const [keys, options] = shardIndex!;
    expect(Object.keys(keys)[0]).toBe('region');
    expect(keys).toMatchObject({ region: 1, tenantId: 1, email: 1 });
    expect(options).toMatchObject({ unique: true });
  });
});

describe('Tenant schema', () => {
  it('accepts a valid tenant in every allowed region', () => {
    for (const region of ALLOWED_REGIONS) {
      const err = new Tenant({ tenantId: 't1', name: 'Acme', region }).validateSync();
      expect(err).toBeUndefined();
    }
  });

  it('rejects an invalid region', () => {
    const err = new Tenant({ tenantId: 't1', name: 'Acme', region: 'XX' as any }).validateSync();
    expect(err?.errors?.region).toBeDefined();
  });

  it('requires tenantId, name and region', () => {
    const err = new Tenant({} as any).validateSync();
    expect(err?.errors?.tenantId).toBeDefined();
    expect(err?.errors?.name).toBeDefined();
    expect(err?.errors?.region).toBeDefined();
  });

  it('defaults createdAt to a Date', () => {
    expect(new Tenant({ tenantId: 't1', name: 'Acme', region: 'EU' }).createdAt).toBeInstanceOf(Date);
  });

  it('declares the region-leading compound shard key for zone routing', () => {
    // sh.shardCollection("global_db.tenants", { region: 1, tenantId: 1 })
    const indexes = Tenant.schema.indexes();
    const shardIndex = indexes.find(
      (entry) => entry[0].region === 1 && entry[0].tenantId === 1
    );
    expect(shardIndex).toBeDefined();
    const [keys] = shardIndex!;
    expect(Object.keys(keys)[0]).toBe('region');
    expect(keys).toMatchObject({ region: 1, tenantId: 1 });
  });
});
