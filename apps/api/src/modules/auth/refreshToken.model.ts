import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { hashToken } from '../../config/auth';

export interface RefreshTokenDoc extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  replacedBy?: string;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, required: true, default: false, index: true },
    replacedBy: { type: String },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ userId: 1, revoked: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken: Model<RefreshTokenDoc> =
  mongoose.models.RefreshToken ?? mongoose.model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);

export { hashToken };
