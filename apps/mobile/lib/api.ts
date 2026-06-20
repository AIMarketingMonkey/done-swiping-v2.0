// Typed fetch wrapper for the Done Swiping API.
// Every call attaches the current Supabase session token as Bearer auth.
// Request/response shapes are validated via shared Zod schemas.

import {
  API_ROUTES,
  type BlockInput,
  type CheckoutResponse,
  type ConsentSubmit,
  type EntitlementResponse,
  type IdvSessionResponse,
  type MatchesResponse,
  type MemoryResponse,
  type MemoryUpdate,
  type PortalResponse,
  type ReportInput,
  type SessionStartResponse,
  blockInputSchema,
  checkoutResponseSchema,
  consentSubmitSchema,
  entitlementResponseSchema,
  idvSessionResponseSchema,
  matchesResponseSchema,
  memoryResponseSchema,
  memoryUpdateSchema,
  portalResponseSchema,
  reportInputSchema,
  sessionStartResponseSchema,
} from '@done-swiping/shared';

import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/**
 * Thrown by startSession() when the API responds with 403.
 * A 403 means the user's age assurance has not yet passed — the UI should
 * redirect back to /onboarding/age-gate rather than showing a generic error.
 */
export class AgeGateError extends Error {
  constructor() {
    super('Age assurance not passed — cannot start voice session.');
    this.name = 'AgeGateError';
  }
}

/**
 * Thrown by startSession() when the API responds with 402.
 * A 402 means the free voice session limit has been reached — the UI should
 * redirect the user to /paywall so they can subscribe.
 */
export class PremiumRequiredError extends Error {
  constructor() {
    super('Free voice session limit reached — premium subscription required.');
    this.name = 'PremiumRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  options: RequestInit & { parseWith?: (json: unknown) => T } = {},
): Promise<T> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) throw new Error('EXPO_PUBLIC_API_URL is not set');

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API ${options.method ?? 'GET'} ${path} → ${response.status}: ${body}`);
  }

  const json: unknown = await response.json();

  if (options.parseWith) {
    return options.parseWith(json);
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

/** POST /session/start — returns LiveKit connection details.
 *
 * Throws `AgeGateError` if the server returns 403 (age assurance not passed).
 * The voice screen catches this and redirects back to /onboarding/age-gate.
 */
export async function startSession(): Promise<SessionStartResponse> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) throw new Error('EXPO_PUBLIC_API_URL is not set');

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${apiUrl}${API_ROUTES.sessionStart}`, {
    method: 'POST',
    headers,
  });

  if (response.status === 402) {
    throw new PremiumRequiredError();
  }

  if (response.status === 403) {
    throw new AgeGateError();
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API POST ${API_ROUTES.sessionStart} → ${response.status}: ${body}`);
  }

  const json: unknown = await response.json();
  return sessionStartResponseSchema.parse(json);
}

/** GET /memory — returns the user's stated attributes, inferred traits, and preferences. */
export async function getMemory(): Promise<MemoryResponse> {
  return apiFetch(API_ROUTES.memory, {
    method: 'GET',
    parseWith: (json) => memoryResponseSchema.parse(json),
  });
}

/** PUT /memory/:id — edit a single memory item. */
export async function updateMemoryItem(id: number, update: MemoryUpdate): Promise<void> {
  const body = memoryUpdateSchema.parse(update);
  await apiFetch(API_ROUTES.memoryItem(id), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** DELETE /memory/:id?kind=... — remove a single memory item.
 *
 * The kind param is required by the API so it knows which table to delete from
 * and can purge any associated server-side embeddings.
 */
export async function deleteMemoryItem(
  id: number,
  kind: 'stated' | 'inferred' | 'preference',
): Promise<void> {
  await apiFetch(`${API_ROUTES.memoryItem(id)}?kind=${kind}`, { method: 'DELETE' });
}

/** GET /memory/export — returns the user's full memory bundle as a JSON object.
 *
 * Use this for the GDPR "export my data" action. The caller is responsible for
 * presenting the result to the user (share sheet, modal, clipboard, etc.).
 */
export async function exportMemory(): Promise<unknown> {
  return apiFetch(API_ROUTES.memoryExport, { method: 'GET' });
}

/** GET /matches — returns current match suggestions with rationale. */
export async function getMatches(): Promise<MatchesResponse> {
  return apiFetch(API_ROUTES.matches, {
    method: 'GET',
    parseWith: (json) => matchesResponseSchema.parse(json),
  });
}

/** POST /report — submit a safety report against another user. */
export async function report(input: ReportInput): Promise<void> {
  const body = reportInputSchema.parse(input);
  await apiFetch(API_ROUTES.report, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** POST /block — block another user. */
export async function block(input: BlockInput): Promise<void> {
  const body = blockInputSchema.parse(input);
  await apiFetch(API_ROUTES.block, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// M1: Identity verification + consent
// ---------------------------------------------------------------------------

/** POST /idv/session — start a Yoti age-assurance session. */
export async function startIdvSession(): Promise<IdvSessionResponse> {
  return apiFetch(API_ROUTES.idvSession, {
    method: 'POST',
    parseWith: (json) => idvSessionResponseSchema.parse(json),
  });
}

/** POST /consent — record explicit GDPR consent grants. */
export async function submitConsent(body: ConsentSubmit): Promise<void> {
  const validated = consentSubmitSchema.parse(body);
  await apiFetch(API_ROUTES.consent, {
    method: 'POST',
    body: JSON.stringify(validated),
  });
}

/**
 * POST /idv/dev/complete — dev-only helper that flips the user's
 * age_assurance_status without a real Yoti check.
 *
 * This method is intentionally unrestricted here; callers are responsible for
 * only exposing the button in __DEV__ builds.
 */
export async function devCompleteIdv(status: 'pass' | 'fail' = 'pass'): Promise<void> {
  await apiFetch('/idv/dev/complete', {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

// ---------------------------------------------------------------------------
// M6: Billing / entitlement
// ---------------------------------------------------------------------------

/**
 * POST /billing/checkout — creates a Stripe Checkout session.
 * Returns a `url` that should be opened in the system browser so the user can
 * complete payment. Stripe bounces back to doneswiping://paywall?status=success.
 */
export async function startCheckout(): Promise<CheckoutResponse> {
  return apiFetch(API_ROUTES.billingCheckout, {
    method: 'POST',
    parseWith: (json) => checkoutResponseSchema.parse(json),
  });
}

/**
 * POST /billing/portal — creates a Stripe Customer Portal session.
 * Returns a `url` that should be opened in the system browser so the user can
 * manage or cancel their subscription. Bounces back via the same deep-link.
 */
export async function openBillingPortal(): Promise<PortalResponse> {
  return apiFetch(API_ROUTES.billingPortal, {
    method: 'POST',
    parseWith: (json) => portalResponseSchema.parse(json),
  });
}

/**
 * GET /me/entitlement — returns the current user's subscription state.
 * `premium` is the single boolean the UI gates on; the rest is for display.
 */
export async function getEntitlement(): Promise<EntitlementResponse> {
  return apiFetch(API_ROUTES.entitlement, {
    method: 'GET',
    parseWith: (json) => entitlementResponseSchema.parse(json),
  });
}
