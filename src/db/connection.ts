import mongoose from 'mongoose';
import mongodb from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/multi-region-demo';
const DEFAULT_PREF = process.env.DEFAULT_READ_PREFERENCE || 'nearest';

// Pure helper: resolves the read preference mode the cluster should use.
// Only the Atlas-supported modes are honoured; anything else falls back to
// 'nearest' so a typo in DEFAULT_READ_PREFERENCE never routes reads in a way
// that defeats the latency goal of zone sharding.
export const VALID_READ_PREFERENCES = [
  'primary',
  'primaryPreferred',
  'secondary',
  'secondaryPreferred',
  'nearest',
] as const;

export type ReadPreference = (typeof VALID_READ_PREFERENCES)[number];

export const resolveReadPreference = (
  value: string | undefined
): ReadPreference => {
  if (value && (VALID_READ_PREFERENCES as readonly string[]).includes(value)) {
    return value as ReadPreference;
  }
  return 'nearest';
};

export const connectToGlobalCluster = async () => {
  try {
    // In a real Atlas environment, the connection string contains
    // the readPreference configuration which routes reads to the nearest node 
    // to lower latency.
    await mongoose.connect(MONGO_URI, {
      readPreference: DEFAULT_PREF as mongodb.ReadPreferenceMode,
      // The application connects to a global conceptual cluster but queries
      // will be explicitly targeted to local zone tags via models.
    });
    console.log(`[MongoDB] Connected to Global Cluster with read preference: ${DEFAULT_PREF}`);
  } catch (error) {
    console.error('[MongoDB] Connection error', error);
    process.exit(1);
  }
};
