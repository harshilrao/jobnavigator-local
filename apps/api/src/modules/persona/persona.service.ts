import { type PersonaDoc, Persona } from './persona.model';

export interface UpsertPersonaInput {
  fullName?: string;
  email?: string;
  phone?: string;
  locations?: unknown[];
  skills?: string[];
  workAuthorization?: string;
  eligibilityAnswers?: Record<string, string>;
  qaBank?: Array<{ question: string; answer: string }>;
  summary?: string;
}

export async function upsertPersona(ownerId: string, input: UpsertPersonaInput): Promise<PersonaDoc> {
  const persona = await Persona.findOneAndUpdate(
    { ownerId },
    { $set: { ...input, ownerId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!persona) {
    throw new Error('Failed to save persona');
  }
  return persona;
}

export async function getPersona(ownerId: string): Promise<PersonaDoc | null> {
  return Persona.findOne({ ownerId }).exec();
}
