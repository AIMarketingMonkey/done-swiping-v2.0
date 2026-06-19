// Shared constants for Done Swiping. Single source of truth for enums, model
// strings, compliance copy and API routes. Imported by api + mobile.

/** Anthropic model strings. Verify at build time — these move quarterly. */
export const MODELS = {
  /** Conversational "brain" used by the voice agent. */
  brain: 'claude-sonnet-4-6',
  /** Extraction + per-turn moderation worker. */
  worker: 'claude-haiku-4-5-20251001',
} as const;

/** pgvector embedding dimensionality (must match the embeddings table). */
export const EMBEDDING_DIM = 1536;

/** Target conversational turn latency (felt-natural threshold). */
export const TURN_LATENCY_TARGET_MS = 800;

/** Transcripts are short-retention, then summarised/deleted. */
export const TRANSCRIPT_RETENTION_DAYS = 30;

// --- Enums (kept in sync with the SQL schema) --------------------------------
export const AGE_ASSURANCE_STATUS = ['pending', 'pass', 'fail'] as const;
export const VERIFICATION_STATUS = ['none', 'verified'] as const;
export const PREFERENCE_TYPE = ['preference', 'dealbreaker'] as const;
export const TRANSCRIPT_ROLE = ['user', 'assistant'] as const;
export const INFERRED_TRAIT_STATUS = ['active', 'decayed', 'contradicted'] as const;
export const EMBEDDING_KIND = ['values', 'interests', 'summary'] as const;
export const MATCH_STATUS = ['suggested', 'accepted', 'declined'] as const;
export const SAFETY_FLAG_STATUS = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
export const SAFETY_FLAG_TYPE = [
  'coercion',
  'fraud',
  'self_harm',
  'minor_safety',
  'sexual_solicitation',
  'abuse',
  'other',
] as const;
export const SUBSCRIPTION_TIER = ['free', 'premium'] as const;
export const SUBSCRIPTION_STATUS = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
] as const;

/** Consent scopes. `special_category` covers orientation etc. (GDPR Art. 9). */
export const CONSENT_SCOPE = [
  'data_processing',
  'special_category',
  'ai_companion',
  'marketing',
] as const;

/** Bump when consent copy materially changes; recorded against each grant. */
export const CONSENT_VERSION = '2026-06-01';

// --- AI disclosure (EU AI Act Art. 50) ---------------------------------------
export const AI_DISCLOSURE = {
  /** Spoken at the start of every voice session. */
  spoken:
    "Before we start — I'm an AI companion, not a human. I'm here to get to know " +
    'you so we can find you better matches. You can stop any time.',
  /** On-screen banner copy, always visible during a session. */
  banner: 'You are talking to an AI companion, not a human.',
  /** Periodic reminder for long/emotional sessions. */
  reminder: "Just a reminder — I'm an AI, here to help you find a good match.",
} as const;

/** Fire a periodic AI-disclosure reminder at least this often in long sessions. */
export const DISCLOSURE_REMINDER_INTERVAL_MS = 10 * 60 * 1000;

// --- API routes (see docs/ARCHITECTURE.md) -----------------------------------
export const API_ROUTES = {
  sessionStart: '/session/start',
  stripeWebhook: '/webhooks/stripe',
  idvWebhook: '/webhooks/idv',
  memory: '/memory',
  memoryItem: (id: string | number) => `/memory/${id}`,
  memoryExport: '/memory/export',
  matches: '/matches',
  report: '/report',
  block: '/block',
} as const;
