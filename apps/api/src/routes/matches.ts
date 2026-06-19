import { Hono } from 'hono';
import { matchesResponseSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { writeAudit } from '../lib/audit.js';

// =============================================================================
// GET /matches — M4 deterministic matching
//
// Pipeline (no LLM re-ranking; entirely deterministic):
//
//   Stage 1 — Hard filters (SQL)
//     Enforced inside match_candidates() Postgres function. Candidates violating
//     any of the user's hard-filter preferences (gender, age_band, orientation,
//     location_region, relationship_intent) are excluded before returning.
//
//   Stage 2 — Compatibility score (TypeScript)
//     Weighted blend:
//       • cosine_similarity (pgvector, summary embeddings)  — weight 0.60
//       • shared profile_attributes overlap                 — weight 0.25
//       • shared inferred_traits overlap                    — weight 0.15
//
//     Overlap is computed as:
//       overlap_score = matched_keys / max(user_count, candidate_count, 1)
//     where "matched_keys" = keys whose values are equal in both sets.
//
//     Final score = 0.60 * cosine + 0.25 * attribute_overlap + 0.15 * trait_overlap
//     Clamped to [0, 1].
//
//   Stage 3 — Rationale (TypeScript)
//     Plain-language sentence assembled from overlapping intent, attributes, and
//     traits. No LLM. Example:
//       "You both want something long-term and share interests in hiking and live music."
//
//   Stage 4 — Safety gate (SQL)
//     Enforced inside match_candidates(): excludes candidates with
//     age_assurance_status != 'pass', open safety_flags, or active blocks
//     in either direction. Never surfaced here regardless of score.
//
// Results are stored in `matches` (status='suggested'), refreshing each run:
// prior 'suggested' rows for the user are deleted and replaced with the new set.
// =============================================================================

// Scoring weights (must sum to 1.0)
const W_COSINE = 0.6;
const W_ATTR = 0.25;
const W_TRAIT = 0.15;

// Shape returned by the match_candidates() Postgres RPC
interface CandidateRow {
  candidate_id: string;
  cosine_similarity: number;
  candidate_age_band: string | null;
  candidate_gender: string | null;
  candidate_orientation: string | null;
  candidate_location: string | null;
  candidate_intent: string | null;
  display_name: string | null;
}

// Minimal shape for profile_attributes rows used in scoring
interface AttributeRow {
  user_id: string;
  key: string;
  value: string;
}

// Minimal shape for inferred_traits rows used in scoring
interface TraitRow {
  user_id: string;
  trait_key: string;
  trait_value: string;
}

/** Build a key→value map from profile_attribute rows for a given user. */
function toAttrMap(rows: AttributeRow[], userId: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    if (r.user_id === userId) m.set(r.key, r.value);
  }
  return m;
}

/** Build a key→value map from inferred_trait rows for a given user. */
function toTraitMap(rows: TraitRow[], userId: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    if (r.user_id === userId) m.set(r.trait_key, r.trait_value);
  }
  return m;
}

/**
 * Fraction of keys shared between two key→value maps (case-insensitive value
 * comparison). Returns 0 when both maps are empty.
 */
function overlapFraction(a: Map<string, string>, b: Map<string, string>): number {
  const denom = Math.max(a.size, b.size, 1);
  let matches = 0;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv !== undefined && bv.toLowerCase() === v.toLowerCase()) matches++;
  }
  return matches / denom;
}

/**
 * Collect keys whose values overlap between two maps; returns display labels
 * using the value string directly (already human-readable from profile data).
 */
function overlappingValues(
  a: Map<string, string>,
  b: Map<string, string>,
  limit: number,
): string[] {
  const out: string[] = [];
  for (const [k, v] of a) {
    if (out.length >= limit) break;
    const bv = b.get(k);
    if (bv !== undefined && bv.toLowerCase() === v.toLowerCase()) {
      // Prefer the value itself (e.g. "hiking", "live music") over the key
      out.push(v);
    }
  }
  return out;
}

/**
 * Build a deterministic, plain-English rationale sentence from shared data.
 * No LLM is used — the sentence is templated from actual overlapping values.
 */
function buildRationale(
  candidateIntent: string | null,
  userIntent: string | null,
  sharedAttributes: string[],
  sharedTraits: string[],
  cosine: number,
): string {
  const parts: string[] = [];

  // Shared relationship intent
  if (candidateIntent && userIntent && candidateIntent.toLowerCase() === userIntent.toLowerCase()) {
    parts.push(`You both want ${userIntent.toLowerCase()}`);
  }

  // Shared attributes + traits (deduplicated, max 4 total)
  const shared = [...new Set([...sharedAttributes, ...sharedTraits])].slice(0, 4);
  if (shared.length === 1) {
    parts.push(`share an interest in ${shared[0]}`);
  } else if (shared.length > 1) {
    const last = shared[shared.length - 1];
    const rest = shared.slice(0, -1).join(', ');
    parts.push(`share interests in ${rest} and ${last}`);
  }

  // Fallback when there is nothing specific to say but the cosine is decent
  if (parts.length === 0) {
    if (cosine >= 0.8) {
      return 'Strong overall profile compatibility based on your values and interests.';
    }
    return 'Good overall profile compatibility based on your values and interests.';
  }

  return parts.join(' and ') + '.';
}

const matches = new Hono();

// ---------------------------------------------------------------------------
// GET /matches
//
// Returns the authenticated user's current match suggestions, recomputed on
// every call (deterministic — no caching layer at MVP).
// ---------------------------------------------------------------------------
matches.get('/', requireAuth, async (c) => {
  const userId = getUserId(c);
  const supabase = getSupabaseAdmin();

  // ------------------------------------------------------------------
  // 1. Call match_candidates() to get Stage-1-filtered + Stage-4-gated
  //    candidates with their cosine similarity scores.
  // ------------------------------------------------------------------
  const { data: candidates, error: rpcError } = await supabase.rpc('match_candidates', {
    p_user: userId,
  });

  if (rpcError) {
    console.error('[matches] match_candidates RPC failed:', rpcError.message);
    return c.json({ error: 'Failed to compute matches' }, 500);
  }

  // No candidates (e.g. user has no summary embedding, or everyone is filtered out)
  if (!candidates || (candidates as CandidateRow[]).length === 0) {
    await writeAudit({
      actor: userId,
      action: 'matches.compute',
      target: userId,
      payload: { candidates_found: 0 },
    });
    const body = matchesResponseSchema.parse({ matches: [] });
    return c.json(body, 200);
  }

  const candidateRows = candidates as CandidateRow[];
  const candidateIds = candidateRows.map((r) => r.candidate_id);

  // ------------------------------------------------------------------
  // 2. Fetch profile_attributes and active inferred_traits for the user
  //    and all candidates in a single query each — used for Stage 2 scoring.
  // ------------------------------------------------------------------
  const allUserIds = [userId, ...candidateIds];

  const [attrResult, traitResult, userProfileResult] = await Promise.all([
    supabase.from('profile_attributes').select('user_id, key, value').in('user_id', allUserIds),
    supabase
      .from('inferred_traits')
      .select('user_id, trait_key, trait_value')
      .in('user_id', allUserIds)
      .eq('status', 'active'),
    // Fetch the current user's own profile for intent comparison in rationale
    supabase.from('profiles').select('relationship_intent').eq('user_id', userId).maybeSingle(),
  ]);

  if (attrResult.error) {
    console.error('[matches] Failed to fetch profile_attributes:', attrResult.error.message);
    return c.json({ error: 'Failed to compute matches' }, 500);
  }
  if (traitResult.error) {
    console.error('[matches] Failed to fetch inferred_traits:', traitResult.error.message);
    return c.json({ error: 'Failed to compute matches' }, 500);
  }

  const attrRows = (attrResult.data ?? []) as AttributeRow[];
  const traitRows = (traitResult.data ?? []) as TraitRow[];
  const userIntent = userProfileResult.data?.relationship_intent ?? null;

  // Pre-build the user's own maps once
  const userAttrMap = toAttrMap(attrRows, userId);
  const userTraitMap = toTraitMap(traitRows, userId);

  // ------------------------------------------------------------------
  // 3. Stage 2 — compute final weighted score and build rationale for
  //    each candidate.
  // ------------------------------------------------------------------
  interface ScoredCandidate {
    candidateId: string;
    score: number;
    rationale: string;
    displayName: string | null;
  }

  const scored: ScoredCandidate[] = candidateRows.map((row) => {
    const cosine = Math.max(0, Math.min(1, row.cosine_similarity ?? 0));

    const candAttrMap = toAttrMap(attrRows, row.candidate_id);
    const candTraitMap = toTraitMap(traitRows, row.candidate_id);

    const attrOverlap = overlapFraction(userAttrMap, candAttrMap);
    const traitOverlap = overlapFraction(userTraitMap, candTraitMap);

    const score = Math.min(1, W_COSINE * cosine + W_ATTR * attrOverlap + W_TRAIT * traitOverlap);

    // Collect up to 3 shared attributes and 2 shared traits for the rationale
    const sharedAttrs = overlappingValues(userAttrMap, candAttrMap, 3);
    const sharedTraits = overlappingValues(userTraitMap, candTraitMap, 2);

    const rationale = buildRationale(
      row.candidate_intent,
      userIntent,
      sharedAttrs,
      sharedTraits,
      cosine,
    );

    return {
      candidateId: row.candidate_id,
      score: Math.round(score * 1000) / 1000, // 3 d.p.
      rationale,
      displayName: row.display_name,
    };
  });

  // Sort descending by final score (cosine pre-sorted in SQL; re-sort after TS blend)
  scored.sort((a, b) => b.score - a.score);

  // ------------------------------------------------------------------
  // 4. Refresh the matches table:
  //    Delete prior 'suggested' rows for this user, insert the new set.
  // ------------------------------------------------------------------
  const { error: deleteError } = await supabase
    .from('matches')
    .delete()
    .eq('user_a', userId)
    .eq('status', 'suggested');

  if (deleteError) {
    console.error('[matches] Failed to clear prior suggestions:', deleteError.message);
    return c.json({ error: 'Failed to refresh matches' }, 500);
  }

  const insertRows = scored.map((s) => ({
    user_a: userId,
    user_b: s.candidateId,
    score: s.score,
    rationale: s.rationale,
    status: 'suggested' as const,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from('matches')
    .insert(insertRows)
    .select('id, user_b, score, rationale, status');

  if (insertError) {
    console.error('[matches] Failed to insert new suggestions:', insertError.message);
    return c.json({ error: 'Failed to store matches' }, 500);
  }

  // ------------------------------------------------------------------
  // 5. Audit log
  // ------------------------------------------------------------------
  await writeAudit({
    actor: userId,
    action: 'matches.compute',
    target: userId,
    payload: {
      candidates_found: candidateRows.length,
      matches_stored: (insertedRows ?? []).length,
    },
  });

  // ------------------------------------------------------------------
  // 6. Build and validate the response against matchesResponseSchema.
  // ------------------------------------------------------------------
  const matchItems = (insertedRows ?? []).map((row) => ({
    id: row.id as number,
    user: row.user_b as string,
    score: row.score as number,
    rationale: row.rationale as string,
    status: row.status as 'suggested' | 'accepted' | 'declined',
  }));

  const body = matchesResponseSchema.parse({ matches: matchItems });
  return c.json(body, 200);
});

export default matches;
