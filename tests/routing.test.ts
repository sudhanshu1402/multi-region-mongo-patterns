import { describe, it, expect } from 'vitest';
import {
  resolveReadPreference,
  VALID_READ_PREFERENCES,
} from '../src/db/connection';

// resolveReadPreference is the pure routing decision: it maps the configured
// DEFAULT_READ_PREFERENCE env value to an Atlas-supported read preference mode,
// falling back to 'nearest' for anything unrecognised so that a misconfigured
// value can never silently route reads in a high-latency way.
describe('resolveReadPreference (read routing)', () => {
  it('passes through every Atlas-supported mode unchanged', () => {
    for (const mode of VALID_READ_PREFERENCES) {
      expect(resolveReadPreference(mode)).toBe(mode);
    }
  });

  it('falls back to nearest when value is undefined', () => {
    expect(resolveReadPreference(undefined)).toBe('nearest');
  });

  it('falls back to nearest when value is an empty string', () => {
    expect(resolveReadPreference('')).toBe('nearest');
  });

  it('falls back to nearest for an unknown / typo mode', () => {
    expect(resolveReadPreference('closest')).toBe('nearest');
    expect(resolveReadPreference('PRIMARY')).toBe('nearest');
  });

  it('is case sensitive (Atlas modes are camelCase)', () => {
    // 'primarypreferred' is not a valid mode, so it must not pass through.
    expect(resolveReadPreference('primarypreferred')).toBe('nearest');
    expect(resolveReadPreference('primaryPreferred')).toBe('primaryPreferred');
  });

  it('exposes exactly the five MongoDB read preference modes', () => {
    expect([...VALID_READ_PREFERENCES]).toEqual([
      'primary',
      'primaryPreferred',
      'secondary',
      'secondaryPreferred',
      'nearest',
    ]);
  });
});
