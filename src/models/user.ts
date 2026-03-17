import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  tenantId: string; // References ITenant
  region: 'EU' | 'USA' | 'KSA'; // Replicated here for strict zone sharding
  role: string;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true },
  tenantId: { type: String, required: true },
  region: { type: String, enum: ['EU', 'USA', 'KSA'], required: true },
  role: { type: String, default: 'member' },
});

// The compound index matches the shard key for perfect data localization.
// Queries not including the region will be broadcast to all shards (scatter-gather).
UserSchema.index({ region: 1, tenantId: 1, email: 1 }, { unique: true });

export const User = mongoose.model<IUser>('User', UserSchema);
