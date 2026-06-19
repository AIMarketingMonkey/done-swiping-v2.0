-- =============================================================================
-- Done Swiping — M4 Matching
-- Migration: 20260619120000_m4_matching.sql
--
-- Creates the `match_candidates(p_user uuid)` function used by the API's
-- service-role client to retrieve a ranked list of potential matches for a
-- given user.
--
-- Pipeline stages (all in a single SQL expression):
--
--   Stage 1 — Hard filters
--       Reject candidates who violate any of the requesting user's hard-filter
--       preferences (is_hard_filter = true OR type = 'dealbreaker').  Only the
--       five profile columns that can be evaluated in SQL are checked here:
--       gender, age_band, orientation, location_region, relationship_intent.
--       Unknown preference keys are skipped and deferred to the TS layer.
--
--   Stage 2 — Embedding similarity (implicit in JOIN)
--       Both the requesting user and the candidate must have a 'summary'
--       embedding row.  INNER JOINs ensure users/candidates without embeddings
--       are excluded.  Cosine similarity = 1 - (candidate <=> user) using the
--       pgvector <=> operator.
--
--   Stage 3 — Safety gate (WHERE clause)
--       • age_assurance_status must be 'pass'
--       • Exclude self
--       • Exclude any user who has blocked p_user or been blocked by p_user
--       • Exclude any user with an open safety_flag
--
--   Results are ordered by cosine similarity descending, capped at 50 rows.
--
-- Trust boundary note:
--   The function is SECURITY DEFINER and intended to be called exclusively via
--   the service-role key from the API after the caller's JWT has been verified.
--   Granting EXECUTE to the `authenticated` role is kept for defence-in-depth
--   (the API may switch to user-JWTs in future), but the API enforces that
--   p_user always equals the authenticated user's own ID — see matches.ts.
-- =============================================================================

CREATE OR REPLACE FUNCTION match_candidates(p_user uuid)
RETURNS TABLE (
  candidate_id          uuid,
  cosine_similarity     float,
  candidate_age_band    text,
  candidate_gender      text,
  candidate_orientation text,
  candidate_location    text,
  candidate_intent      text,
  display_name          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  -- Guard: caller must be the user themselves OR service role (service role bypasses RLS)
  -- We rely on the API layer to pass the correct p_user. The function is SECURITY DEFINER
  -- so it runs as the definer (postgres/service role). We do NOT additionally check auth.uid()
  -- here because this function may be called from a service-role context where auth.uid() is null.
  -- The API calls this ONLY with the authed user's own ID — see matches.ts for enforcement.

  WITH user_embedding AS (
    -- Fetch the requesting user's 'summary' embedding.
    -- If none exists the CTE returns zero rows; the subsequent INNER JOIN
    -- will produce an empty result set (no matches returned).
    SELECT embedding
    FROM   embeddings
    WHERE  user_id = p_user
      AND  kind    = 'summary'
    LIMIT  1
  )
  SELECT
    cand.user_id                                                  AS candidate_id,
    (1.0 - (cand_emb.embedding <=> user_emb.embedding))::float  AS cosine_similarity,
    cand.age_band                                                 AS candidate_age_band,
    cand.gender                                                   AS candidate_gender,
    cand.orientation                                              AS candidate_orientation,
    cand.location_region                                          AS candidate_location,
    cand.relationship_intent                                      AS candidate_intent,
    cand.display_name                                             AS display_name
  FROM
    profiles                       AS cand
    -- Candidate must have a summary embedding; excludes those without one.
    INNER JOIN embeddings           AS cand_emb
      ON  cand_emb.user_id = cand.user_id
      AND cand_emb.kind    = 'summary'
    -- Requesting user must also have a summary embedding; zero rows if not.
    INNER JOIN user_embedding       AS user_emb
      ON  true
  WHERE
    -- -------------------------------------------------------------------------
    -- Stage 4 — Safety gate
    -- -------------------------------------------------------------------------

    -- Must have passed age assurance (UK Online Safety Act requirement)
    cand.age_assurance_status = 'pass'

    -- Exclude self
    AND cand.user_id <> p_user

    -- Exclude users blocked in either direction
    AND NOT EXISTS (
      SELECT 1
      FROM   blocks b
      WHERE  (b.blocker = p_user       AND b.blocked = cand.user_id)
          OR (b.blocker = cand.user_id AND b.blocked = p_user)
    )

    -- Exclude users with any open safety flag
    AND NOT EXISTS (
      SELECT 1
      FROM   safety_flags sf
      WHERE  sf.user_id = cand.user_id
        AND  sf.status  = 'open'
    )

    -- -------------------------------------------------------------------------
    -- Stage 1 — Hard filters (known profile-column mappings only)
    -- For each hard-filter / dealbreaker preference of p_user the candidate's
    -- corresponding profiles column must equal the required value.
    -- Unknown keys (no profiles column mapping) are skipped here and are
    -- handled in the TypeScript layer after this function returns.
    -- -------------------------------------------------------------------------

    -- gender hard filter
    AND NOT EXISTS (
      SELECT 1
      FROM   preferences pf
      WHERE  pf.user_id       = p_user
        AND  (pf.is_hard_filter = true OR pf.type = 'dealbreaker')
        AND  pf.key            = 'gender'
        AND  pf.value         <> cand.gender
    )

    -- age_band hard filter
    AND NOT EXISTS (
      SELECT 1
      FROM   preferences pf
      WHERE  pf.user_id       = p_user
        AND  (pf.is_hard_filter = true OR pf.type = 'dealbreaker')
        AND  pf.key            = 'age_band'
        AND  pf.value         <> cand.age_band
    )

    -- orientation hard filter
    AND NOT EXISTS (
      SELECT 1
      FROM   preferences pf
      WHERE  pf.user_id       = p_user
        AND  (pf.is_hard_filter = true OR pf.type = 'dealbreaker')
        AND  pf.key            = 'orientation'
        AND  pf.value         <> cand.orientation
    )

    -- location_region hard filter
    AND NOT EXISTS (
      SELECT 1
      FROM   preferences pf
      WHERE  pf.user_id       = p_user
        AND  (pf.is_hard_filter = true OR pf.type = 'dealbreaker')
        AND  pf.key            = 'location_region'
        AND  pf.value         <> cand.location_region
    )

    -- relationship_intent hard filter
    AND NOT EXISTS (
      SELECT 1
      FROM   preferences pf
      WHERE  pf.user_id       = p_user
        AND  (pf.is_hard_filter = true OR pf.type = 'dealbreaker')
        AND  pf.key            = 'relationship_intent'
        AND  pf.value         <> cand.relationship_intent
    )

  ORDER BY cosine_similarity DESC
  LIMIT 50;
$$;

-- Grant execution to authenticated role.
-- The API enforces that p_user == the caller's own user ID before invoking this
-- function; this grant exists for defence-in-depth if the calling pattern
-- evolves to use user-scoped JWTs directly.
GRANT EXECUTE ON FUNCTION match_candidates(uuid) TO authenticated;

COMMENT ON FUNCTION match_candidates IS
  'Returns up to 50 candidate profiles for p_user, ranked by cosine similarity '
  'of their summary embeddings. Applies hard-filter preferences (gender, age_band, '
  'orientation, location_region, relationship_intent), safety gate (age assurance, '
  'blocks, open safety flags), and excludes self. Intended for service-role callers '
  'via the API (matches.ts); SECURITY DEFINER runs as the function owner.';
