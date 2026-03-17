import mongoose, { Schema, Document } from 'mongoose';

export interface ITenant extends Document {
  tenantId: string;
  name: string;
  region: 'EU' | 'USA' | 'KSA'; // Used as the shard key for zone routing
  createdAt: Date;
}

const TenantSchema = new Schema<ITenant>({
  tenantId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  region: { type: String, enum: ['EU', 'USA', 'KSA'], required: true },
  createdAt: { type: Date, default: Date.now },
});

// IMPORTANT: In Atlas, this collection would be sharded.
// The compound key ensures data residency by mapping the 'region' to a 
// specific geographic zone (e.g. Frankfurt, Virginia, Riyadh).
//
// In mongo shell this looks like: 
// sh.shardCollection("global_db.tenants", { "region": 1, "tenantId": 1 })
// sh.addTagRange("global_db.tenants", { "region": "EU", "tenantId": MinKey }, { "region": "EU", "tenantId": MaxKey }, "EU_ZONE")

TenantSchema.index({ region: 1, tenantId: 1 }, { unique: true });

export const Tenant = mongoose.model<ITenant>('Tenant', TenantSchema);
