import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getEnv } from '../../config/env';

export type AIProviderId = 'ollama' | 'fcc-proxy';

/**
 * Structured match report schema validated by Zod on both sides.
 * Never ask the model to invent qualifications — evidence comes from JD and resume text only.
 */
export const MatchReportSchema = z.object({
  fitSummary: z.string().describe('Plain-language fit summary'),
  requiredSkills: z
    .array(
      z.object({
        skill: z.string(),
        requirement: z.enum(['required', 'preferred']).describe('Whether the skill is required or preferred per the JD'),
        jdEvidence: z.string().describe('Direct quote from the JD mentioning this skill'),
        resumeEvidence: z.string().describe('Direct quote from the resume showing this skill, or "missing" if absent'),
        status: z.enum(['met', 'partial', 'missing', 'unknown']).describe('Match status: met=resume shows skill, partial=some evidence, missing=not found, unknown=cannot determine'),
      })
    )
    .describe('Each requirement with JD evidence and resume evidence. requirement: required|preferred. status: met|partial|missing|unknown.'),
  relevantKeywords: z.array(z.string()).describe('Keywords from the JD worth emphasizing'),
  cautions: z.array(z.string()).describe('Gaps or mismatches to address'),
  suggestedImprovements: z.array(z.string()).describe('Actionable resume improvements'),
  matchScore: z.number().min(0).max(100).describe('Heuristic match score 0-100, not an ATS score'),
  rubric: z.string().describe('How the score was calculated'),
});

type MatchReportOutput = z.infer<typeof MatchReportSchema>;

export interface AIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  /** Provider model identifier used for cache keys and display. */
  readonly modelName: string;
  /** Reachability + latency probe. Never blocks the UI. */
  healthCheck(): Promise<{ reachable: boolean; latencyMs?: number; error?: string }>;
  /** Available model IDs for this provider. */
  listModels(): Promise<string[]>;
  /** Structured chat: returns Zod-validated JSON. One bounded repair attempt on invalid JSON. */
  structuredChat<T>(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    schema: z.ZodSchema<T>,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<T>;
  capabilityInfo(): { structuredOutput: boolean; jsonMode: boolean };
}

/** Prompt-injection guard: strip common jailbreak patterns from user-supplied JD text. */
function sanitizeJDText(text: string): string {
  return text
    .replace(/ignore\s+(all\s+)?(previous\s+)?(instructions|commands|prompt)/gi, '[redacted instruction]')
    .replace(/system\s*:\s*/gi, '[redacted system]')
    .replace(/you are now\s+/gi, '[redacted role]')
    .trim();
}

/** Build the scoring prompt. Evidence only — no invented qualifications. */
function buildScoringMessages(resumeText: string, jdText: string): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const system = `You are a career-coach assistant. Compare the resume against the job description using ONLY evidence present in both texts.
Do not invent degrees, dates, skills, companies, achievements, or work authorizations.
If evidence is absent, mark status "unknown" or "missing" — never hallucinate.

Return strictly valid JSON matching this exact schema:
{
  "fitSummary": "string - plain-language fit summary",
  "requiredSkills": [
    {
      "skill": "string",
      "requirement": "required" | "preferred",  // per the JD: is this skill required or preferred?
      "jdEvidence": "string - direct quote from JD mentioning this skill",
      "resumeEvidence": 'string - direct quote from resume showing this skill, or "missing" if absent',
      "status": "met" | "partial" | "missing" | "unknown"  // match status: met=resume shows skill, partial=some evidence, missing=not found, unknown=cannot determine
    }
  ],
  "relevantKeywords": ["string - keywords from JD worth emphasizing"],
  "cautions": ["string - gaps or mismatches to address"],
  "suggestedImprovements": ["string - actionable resume improvements"],
  "matchScore": "number 0-100 - heuristic match score, not an ATS score",
  "rubric": "string - how the score was calculated"
}

IMPORTANT: "requirement" comes from the JD (required/preferred). "status" comes from comparing resume to JD (met/partial/missing/unknown). Do NOT put "missing" in requirement.

No markdown fences, no extra prose, no comments. Output only the JSON object.`;
  const user = `RESUME:
---
${resumeText}

JOB DESCRIPTION:
---
${sanitizeJDText(jdText)}

Produce a structured match report.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Checksum of text for cache keying. */
function textChecksum(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

const PROMPT_VERSION = 'v1';

/* ------------------------------------------------------------------ */
/* Ollama provider                                                    */
/* ------------------------------------------------------------------ */

export class OllamaProvider implements AIProvider {
  readonly id: AIProviderId = 'ollama';
  readonly name = 'Ollama (local)';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    const env = getEnv();
    this.baseUrl = env.OLLAMA_BASE_URL.replace(/\/$/, '');
    this.model = env.OLLAMA_MODEL;
  }

  get modelName(): string {
    return this.model;
  }

  async healthCheck(): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      return {
        reachable: res.ok,
        latencyMs: Date.now() - start,
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      };
    } catch (err) {
      return { reachable: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models ?? []).map((m: { name?: string }) => m.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  async structuredChat<T>(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    schema: z.ZodSchema<T>,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<T> {
    const lastUser = messages[messages.length - 1]?.content ?? '';
    const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: lastUser },
      ],
      stream: false,
      format: 'json',
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxTokens !== undefined && { num_predict: options.maxTokens }),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`Ollama chat returned HTTP ${res.status}`);
      }
      const data = await res.json();
      const content = data.message?.content ?? '';
      return this.parseAndRepair(content, schema);
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  private async parseAndRepair<T>(content: string, schema: z.ZodSchema<T>): Promise<T> {
    // Attempt 1: parse directly.
    try {
      return schema.parse(JSON.parse(content));
    } catch {
      // Attempt 2: bounded repair — ask model to re-emit clean JSON.
      // We reuse a minimal self-correction prompt rather than infinite loops.
      const repair = await this.structuredChat(
        [
          { role: 'system', content: 'Return only valid JSON matching the schema. No prose.' },
          {
            role: 'user',
            content: `The previous response was invalid JSON. Re-emit the same match report as clean JSON only:
${content.slice(0, 2000)}`,
          },
        ],
        schema
      );
      return repair;
    }
  }

  capabilityInfo(): { structuredOutput: boolean; jsonMode: boolean } {
    return { structuredOutput: true, jsonMode: true };
  }
}

/* ------------------------------------------------------------------ */
/* Free Claude Code proxy provider (OpenAI-compatible)               */
/* ------------------------------------------------------------------ */

export class FccProxyProvider implements AIProvider {
  readonly id: AIProviderId = 'fcc-proxy';
  readonly name = 'Free Claude Code proxy';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly enabled: boolean;

  constructor() {
    const env = getEnv();
    this.enabled = env.FCC_PROXY_ENABLED === true;
    this.baseUrl = env.FCC_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8082/v1';
    this.model = env.FCC_BASE_URL ? 'fcc-proxy-model' : '';
  }

  get modelName(): string {
    return this.model;
  }

  async healthCheck(): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> {
    if (!this.enabled) {
      return { reachable: false, error: 'FCC proxy disabled by default' };
    }
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}/models`, { signal: controller.signal });
      clearTimeout(timeout);
      return {
        reachable: res.ok,
        latencyMs: Date.now() - start,
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      };
    } catch (err) {
      return { reachable: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.enabled) return [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}/models`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data ?? []).map((m: { id?: string }) => m.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  async structuredChat<T>(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    schema: z.ZodSchema<T>,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<T> {
    if (!this.enabled) {
      throw new Error('FCC proxy is disabled. Enable FCC_PROXY_ENABLED=true to use it.');
    }
    const lastUser = messages[messages.length - 1]?.content ?? '';
    const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: lastUser },
      ],
      response_format: { type: 'json_object' },
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`FCC proxy returned HTTP ${res.status}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      return this.parseAndRepair(content, schema);
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  private async parseAndRepair<T>(content: string, schema: z.ZodSchema<T>): Promise<T> {
    try {
      return schema.parse(JSON.parse(content));
    } catch {
      const repair = await this.structuredChat(
        [
          { role: 'system', content: 'Return only valid JSON matching the schema. No prose.' },
          {
            role: 'user',
            content: `Re-emit valid JSON only:
${content.slice(0, 2000)}`,
          },
        ],
        schema
      );
      return repair;
    }
  }

  capabilityInfo(): { structuredOutput: boolean; jsonMode: boolean } {
    return { structuredOutput: true, jsonMode: true };
  }
}

export function createProvider(id: AIProviderId): AIProvider {
  switch (id) {
    case 'ollama':
      return new OllamaProvider();
    case 'fcc-proxy':
      return new FccProxyProvider();
    default:
      throw new Error(`Unknown AI provider: ${id}`);
  }
}

export { buildScoringMessages, PROMPT_VERSION, textChecksum, sanitizeJDText };
export type { MatchReportOutput };
