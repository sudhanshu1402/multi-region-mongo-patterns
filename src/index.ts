import express from 'express';
import { connectToGlobalCluster } from './db/connection';
import { Tenant } from './models/tenant';
import { User } from './models/user';
import { asRegion, checkUserResidency, REGIONS } from './residency';
import { readLimiter, writeLimiter } from './rateLimit';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Behind a load balancer every request arrives from the balancer's address, which
// would put the whole internet in one rate-limit bucket. TRUST_PROXY is the number
// of proxy hops to trust. Left unset, Express trusts nothing, which is the safe
// default: an attacker cannot forge a lower hop count.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  const hops = Number(trustProxy);
  app.set('trust proxy', Number.isInteger(hops) ? hops : trustProxy);
}

app.use(express.json());

// Untrusted body fields reach Mongoose query filters. A JSON body can carry an
// object, so `{"tenantId":{"$ne":"x"}}` would become a query operator and match
// the wrong tenant. Reject anything that is not a plain non-empty string.
const asId = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

// Endpoint demonstrating zone-targeted writes
app.post('/api/v1/tenants', writeLimiter, async (req, res) => {
  try {
    const { tenantId, name, region } = req.body;
    
    // In Atlas, inserting this document routes it strictly to the replica set
    // residing in the specified 'region' zone (EU, USA, KSA).
    const tenant = await Tenant.create({ tenantId, name, region });
    res.status(201).json(tenant);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Endpoint demonstrating data-resident user creation
app.post('/api/v1/users', writeLimiter, async (req, res) => {
  try {
    const { email, region } = req.body;
    const tenantId = asId(req.body?.tenantId);
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId must be a non-empty string' });
      return;
    }
    // Enforce data residency: the user's region must match its tenant's zone.
    const tenant = await Tenant.findOne({ tenantId });
    const check = checkUserResidency(tenant, region);
    if (!check.ok) {
      res.status(check.status ?? 400).json({ error: check.error });
      return;
    }
    const user = await User.create({ email, tenantId, region });
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Endpoint demonstrating targeted reads avoiding scatter-gather
app.get('/api/v1/users/:region/:tenantId', readLimiter, async (req, res) => {
  try {
    const region = asRegion(req.params.region);
    const tenantId = asId(req.params.tenantId);
    if (!region || !tenantId) {
      res.status(400).json({ error: `region must be one of ${REGIONS.join(', ')} and tenantId non-empty` });
      return;
    }

    // By including the `region` in the query, the mongos router forwards
    // the request ONLY to the shard hosting that region's zone, avoiding
    // cross-region global network hops.
    const users = await User.find({ region, tenantId })
      .read('nearest') // Override to explicit nearest read preference for speed
      .lean();
      
    res.status(200).json(users);
  } catch (error: unknown) {
    // A read failure here is a cluster problem, not a caller problem, and the
    // driver's message can name hosts, replica sets and auth state. The detail
    // belongs in the log; the caller gets a generic 500.
    console.error('[residency] read failed', error);
    res.status(500).json({ error: 'Read failed.' });
  }
});

const startServer = async () => {
  await connectToGlobalCluster();
  app.listen(port, () => {
    console.log(`🚀 Multi-region gateway running on port ${port}`);
  });
};

startServer();
