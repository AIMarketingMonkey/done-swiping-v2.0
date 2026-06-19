// Zod schemas — the validation contracts for every API boundary (§9).
// Both apps/api (server-side validation) and apps/mobile (client typing) import
// these so the wire format has a single source of truth.
import { z } from 'zod';
import {
  AGE_ASSURANCE_STATUS,
  CONSENT_SCOPE,
  EMBEDDING_KIND,
  IDV_PROVIDER,
  INFERRED_TRAIT_STATUS,
  MATCH_STATUS,
  PREFERENCE_TYPE,
  SAFETY_FLAG_TYPE,
} from './constants.js';

// --- Profile -----------------------------------------------------------------
export const profileUpdateSchema = z.object({
  display_name: z.string().min(1).max(80).optional(),
  age_band: z.string().max(20).optional(),
  gender: z.string().max(40).optional(),
  orientation: z.string().max(40).optional(),
  location_region: z.string().max(80).optional(),
  relationship_intent: z.string().max(80).optional(),
  bio: z.string().max(2000).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

// --- Consent -----------------------------------------------------------------
export const consentInputSchema = z.object({
  scope: z.enum(CONSENT_SCOPE),
  granted: z.boolean(),
  version: z.string(),
});
export type ConsentInput = z.infer<typeof consentInputSchema>;

// Consent screen submits all grants at once (POST /consent).
export const consentSubmitSchema = z.object({
  consents: z.array(consentInputSchema).min(1),
});
export type ConsentSubmit = z.infer<typeof consentSubmitSchema>;

// --- Session start (POST /session/start) -------------------------------------
export const sessionStartResponseSchema = z.object({
  livekit_url: z.string().url(),
  token: z.string(),
  room: z.string(),
});
export type SessionStartResponse = z.infer<typeof sessionStartResponseSchema>;

// --- Memory (GET /memory) ----------------------------------------------------
export const statedItemSchema = z.object({
  id: z.number(),
  key: z.string(),
  value: z.string(),
  source: z.string(),
  confidence: z.number(),
});
export const inferredItemSchema = z.object({
  id: z.number(),
  trait_key: z.string(),
  trait_value: z.string(),
  confidence: z.number(),
  source_turn_id: z.number().nullable(),
  status: z.enum(INFERRED_TRAIT_STATUS),
});
export const preferenceItemSchema = z.object({
  id: z.number(),
  type: z.enum(PREFERENCE_TYPE),
  key: z.string(),
  value: z.string(),
  is_hard_filter: z.boolean(),
});
export const memoryResponseSchema = z.object({
  stated: z.array(statedItemSchema),
  inferred: z.array(inferredItemSchema),
  preferences: z.array(preferenceItemSchema),
});
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;

// --- Memory edit (PUT /memory/:id) -------------------------------------------
// The user can correct a value, confirm/reject an inferred trait, or toggle a
// preference into a hard filter. The model NEVER sets hard filters itself.
export const memoryUpdateSchema = z
  .object({
    kind: z.enum(['stated', 'inferred', 'preference']),
    value: z.string().max(500).optional(),
    trait_value: z.string().max(500).optional(),
    status: z.enum(INFERRED_TRAIT_STATUS).optional(),
    is_hard_filter: z.boolean().optional(),
  })
  .refine((v) => v.value || v.trait_value || v.status || v.is_hard_filter !== undefined, {
    message: 'No updatable fields provided',
  });
export type MemoryUpdate = z.infer<typeof memoryUpdateSchema>;

// --- Matches (GET /matches) --------------------------------------------------
export const matchItemSchema = z.object({
  user: z.string(),
  score: z.number(),
  rationale: z.string(),
  status: z.enum(MATCH_STATUS),
});
export const matchesResponseSchema = z.object({
  matches: z.array(matchItemSchema),
});
export type MatchesResponse = z.infer<typeof matchesResponseSchema>;

// --- Report / Block ----------------------------------------------------------
export const reportInputSchema = z.object({
  reported: z.string().uuid(),
  reason: z.string().min(1).max(1000),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

export const blockInputSchema = z.object({
  blocked: z.string().uuid(),
});
export type BlockInput = z.infer<typeof blockInputSchema>;

// --- Extraction worker output (strict JSON; never emits hard filters) --------
export const extractionResultSchema = z.object({
  stated: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1).default(1),
    }),
  ),
  inferred: z.array(
    z.object({
      trait_key: z.string(),
      trait_value: z.string(),
      confidence: z.number().min(0).max(1),
      source_turn_id: z.number().nullable().optional(),
      needs_user_confirmation: z.boolean().default(false),
    }),
  ),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

// --- IDV webhook payload (provider-agnostic, normalised) ---------------------
export const idvWebhookSchema = z.object({
  user_id: z.string().uuid(),
  age_assurance_status: z.enum(AGE_ASSURANCE_STATUS),
  provider: z.string(),
  reference: z.string().optional(),
});
export type IdvWebhook = z.infer<typeof idvWebhookSchema>;

// --- IDV session start (POST /idv/session) -----------------------------------
// The app asks the API to open an age-assurance session; the API returns
// whatever the client needs to launch the provider's flow (Yoti: a session id +
// client token, or a hosted URL).
export const idvSessionResponseSchema = z.object({
  provider: z.enum(IDV_PROVIDER),
  session_id: z.string(),
  client_session_token: z.string().optional(),
  url: z.string().url().optional(),
});
export type IdvSessionResponse = z.infer<typeof idvSessionResponseSchema>;

// --- Safety classification (per-turn Haiku check) ----------------------------
export const safetyClassificationSchema = z.object({
  flagged: z.boolean(),
  type: z.enum(SAFETY_FLAG_TYPE).nullable(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).nullable(),
  rationale: z.string().optional(),
});
export type SafetyClassification = z.infer<typeof safetyClassificationSchema>;

// --- Embeddings (kind enum re-exported as a schema for convenience) ----------
export const embeddingKindSchema = z.enum(EMBEDDING_KIND);
