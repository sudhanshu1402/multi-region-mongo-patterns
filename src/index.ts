import express from 'express';
import { connectToGlobalCluster } from './db/connection';
import { Tenant } from './models/tenant';
import { User } from './models/user';
import { asRegion, checkUserResidency, REGIONS } from './residency';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Untrusted body fields reach Mongoose query filters. A JSON body can carry an
// object, so `{"tenantId":{"$ne":"x"}}` would become a query operator and match
// the wrong tenant. Reject anything that is not a plain non-empty string.
const asId = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

// Endpoint demonstrating zone-targeted writes
app.post('/api/v1/tenants', async (req, res) => {
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
app.post('/api/v1/users', async (req, res) => {
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
app.get('/api/v1/users/:region/:tenantId', async (req, res) => {
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const startServer = async () => {
  await connectToGlobalCluster();
  app.listen(port, () => {
    console.log(`🚀 Multi-region gateway running on port ${port}`);
  });
};

startServer();
