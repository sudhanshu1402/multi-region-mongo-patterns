import { checkUserResidency } from '../src/residency';

const tenant = { region: 'EU' } as const;

for (const userRegion of ['EU', 'USA']) {
  console.log(`user in ${userRegion}: ${JSON.stringify(checkUserResidency(tenant, userRegion))}`);
}
