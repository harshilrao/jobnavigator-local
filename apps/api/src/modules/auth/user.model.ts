import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface UserDoc extends Document {
  email: string;
  passwordHash: string;
  role: string;
  accountStatus: string;
  preferences?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, default: 'owner' },
    accountStatus: { type: String, required: true, default: 'active' },
    preferences: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

export const User: Model<UserDoc> = mongoose.model<UserDoc>('User', userSchema);
