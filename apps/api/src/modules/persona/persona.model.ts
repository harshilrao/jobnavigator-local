import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface QAPair {
  question: string;
  answer: string;
}

export interface LocationPreference {
  city?: string;
  state?: string;
  country?: string;
  remote?: boolean;
  hybrid?: boolean;
  onsite?: boolean;
}

export interface PersonaDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  fullName?: string;
  email?: string;
  phone?: string;
  locations: LocationPreference[];
  skills: string[];
  workAuthorization?: string; // e.g. "Citizen", "Permanent resident", "Visa sponsored"
  eligibilityAnswers: Record<string, string>;
  qaBank: QAPair[];
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const personaSchema = new Schema<PersonaDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    fullName: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    locations: [{ type: Schema.Types.Mixed, default: [] }],
    skills: [{ type: String, default: [] }],
    workAuthorization: { type: String, trim: true },
    eligibilityAnswers: { type: Schema.Types.Mixed, default: {} },
    qaBank: [{ question: String, answer: String }],
    summary: { type: String, trim: true },
  },
  { timestamps: true }
);

personaSchema.index({ ownerId: 1 }, { unique: true });

export const Persona: Model<PersonaDoc> =
  mongoose.models.Persona ?? mongoose.model<PersonaDoc>('Persona', personaSchema);
