# Design notes

## The problem

GDPR Article 44 and similar laws (Saudi PDPL and friends) say a resident's personal data stays inside a geographic boundary. Running a separate cluster per region gets you operational overhead, cross-region joins, and a connection-management mess.

Zone sharding gives one logical cluster and one connection string, with documents pinned to region-specific replica sets by shard key. The app writes normally, Atlas puts the bytes in the right country.

## Cluster setup, run once

```javascript
sh.shardCollection("global_db.tenants", { "region": 1, "tenantId": 1 })
sh.addTagRange("global_db.tenants",
  { "region": "EU", "tenantId": MinKey },
  { "region": "EU", "tenantId": MaxKey },
  "EU_ZONE")
// repeat for USA_ZONE and KSA_ZONE
```

Adding a fourth region is an enum value in `src/residency.ts` plus one more Atlas zone tag here.

## curl walkthrough

```bash
curl -X POST http://localhost:3000/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "acme-eu", "name": "Acme GmbH", "region": "EU"}'

# wrong zone for that tenant, 409
curl -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email": "ana@acme.eu", "tenantId": "acme-eu", "region": "USA"}'

# same zone, allowed
curl -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email": "ana@acme.eu", "tenantId": "acme-eu", "region": "EU"}'

curl http://localhost:3000/api/v1/users/EU/acme-eu
```

## What else it doesn't do

- No chunk pre-splitting, so onboarding one enormous tenant will distribute badly.
- Three regions hardcoded in the enum; adding APAC is an enum value plus an Atlas zone tag.
