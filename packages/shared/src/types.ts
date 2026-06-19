// Database row types — kept in sync with supabase/migrations.
// These describe rows as stored; API request/response shapes live in schemas.ts.

export type AgeAssuranceStatus = 'pending' | 'pass' | 'fail';
export type VerificationStatus = 'none' | 'verified';
export type PreferenceType = 'preference' | 'dealbreaker';
export type TranscriptRole = 'user' | 'assistant';
export type InferredTraitStatus = 'active' | 'decayed' | 'contradicted';
export type EmbeddingKind = 'values' | 'interests' | 'summary';
export type MatchStatus = 'suggested' | 'accepted' | 'declined';
export type SafetyFlagStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export interface Profile {
  user_id: string;
  display_name: string | null;
  age_band: string | null;
  gender: string | null;
  orientation: string | null;
  location_region: string | null;
  relationship_intent: string | null;
  bio: string | null;
  age_assurance_status: AgeAssuranceStatus;
  verification_status: VerificationStatus;
  created_at: string;
}

export interface ProfileAttribute {
  id: number;
  user_id: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  created_at: string;
}

export interface InferredTrait {
  id: number;
  user_id: string;
  trait_key: string;
  trait_value: string;
  confidence: number;
  source_turn_id: number | null;
  status: InferredTraitStatus;
  updated_at: string;
}

export interface Preference {
  id: number;
  user_id: string;
  type: PreferenceType;
  key: string;
  value: string;
  is_hard_filter: boolean;
}

export interface EmbeddingRow {
  id: number;
  user_id: string;
  kind: EmbeddingKind;
  content_ref: string | null;
  embedding: number[];
}

export interface Conversation {
  id: number;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  retention_expires_at: string | null;
}

export interface TranscriptTurn {
  id: number;
  conversation_id: number;
  role: TranscriptRole;
  text: string;
  created_at: string;
}

export interface Consent {
  user_id: string;
  scope: string;
  granted: boolean;
  version: string;
  granted_at: string;
}

export interface SafetyFlag {
  id: number;
  user_id: string | null;
  conversation_id: number | null;
  type: string | null;
  severity: string | null;
  status: SafetyFlagStatus;
  reviewed_by: string | null;
  created_at: string;
}

export interface MatchRow {
  id: number;
  user_a: string;
  user_b: string;
  score: number | null;
  rationale: string | null;
  status: MatchStatus;
  created_at: string;
}

export interface Report {
  id: number;
  reporter: string;
  reported: string;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface Block {
  blocker: string;
  blocked: string;
  created_at: string;
}

export interface Subscription {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tier: string | null;
  status: string | null;
  current_period_end: string | null;
}

export interface AuditLogEntry {
  id: number;
  actor: string | null;
  action: string;
  target: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}
