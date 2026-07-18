export type Region = 'EU' | 'USA' | 'KSA';

export interface ResidencyResult {
  ok: boolean;
  status?: number;
  error?: string;
}

// Write-time data-residency guard: a user may only be created in the region its
// tenant is pinned to. Without it, POST /users could place a record in a zone
// that violates the tenant's residency requirement (or reference no tenant).
export const checkUserResidency = (
  tenant: { region: Region } | null | undefined,
  userRegion: unknown
): ResidencyResult => {
  if (!tenant) {
    return { ok: false, status: 404, error: 'tenant not found' };
  }
  if (userRegion !== tenant.region) {
    return {
      ok: false,
      status: 409,
      error: `data residency violation: user region '${String(
        userRegion
      )}' does not match tenant region '${tenant.region}'`,
    };
  }
  return { ok: true };
};
