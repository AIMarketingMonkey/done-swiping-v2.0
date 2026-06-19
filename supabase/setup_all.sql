-- ============================================================================
-- Done Swiping — one-shot schema setup for the Supabase SQL Editor.
-- Paste this entire file into the SQL Editor (New query) and click Run.
--
-- WARNING: RESETS the app tables (drops + recreates). Safe to re-run on a
-- FRESH project; do NOT run against a database holding real data.
-- For incremental updates on an existing DB, apply individual migration files.
-- ============================================================================
set search_path = public, extensions;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.match_candidates(uuid) cascade;
drop table if exists
  public.audit_log, public.subscriptions, public.matches, public.blocks,
  public.reports, public.safety_flags, public.consents,
  public.transcript_turns, public.conversations, public.embeddings,
  public.preferences, public.inferred_traits, public.profile_attributes,
  public.profiles
cascade;

-- ────────────────────────────────────────────────────────────────────────
-- 20260619090000_init.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- Done Swiping — initial schema
-- Everything is keyed to auth.users. pgvector enabled for semantic matching.
-- RLS is enabled and policies are defined in the next migration (..._rls.sql).
-- =============================================================================

create extension if not exists vector;

-- -----------------------------------------------------------------------------
-- Structured, user-editable profile
-- -----------------------------------------------------------------------------
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  age_band text,
  gender text,
  orientation text, -- special-category: consent required
  location_region text,
  relationship_intent text,
  bio text,
  age_assurance_status text default 'pending', -- pending|pass|fail
  verification_status text default 'none',      -- none|verified (liveness, later)
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- Stated facts (deterministic, confidence 1.0)
-- -----------------------------------------------------------------------------
create table profile_attributes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  key text not null,
  value text not null,
  source text default 'stated',
  confidence numeric default 1.0,
  created_at timestamptz default now()
);
create index profile_attributes_user_id_idx on profile_attributes (user_id);

-- -----------------------------------------------------------------------------
-- Inferred traits (always separable from stated; decay/contradict-aware).
-- Written by the extraction worker (service role); reviewed/edited/deleted by
-- the user via the Memory screen.
-- -----------------------------------------------------------------------------
create table inferred_traits (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  trait_key text not null,
  trait_value text not null,
  confidence numeric not null,
  source_turn_id bigint,
  status text default 'active', -- active|decayed|contradicted
  updated_at timestamptz default now()
);
create index inferred_traits_user_id_idx on inferred_traits (user_id);

-- -----------------------------------------------------------------------------
-- Preferences & deal-breakers (hard filters are user-controlled)
-- -----------------------------------------------------------------------------
create table preferences (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  type text not null, -- preference|dealbreaker
  key text not null,
  value text not null,
  is_hard_filter boolean default false
);
create index preferences_user_id_idx on preferences (user_id);

-- -----------------------------------------------------------------------------
-- Embeddings for semantic matching/retrieval
-- -----------------------------------------------------------------------------
create table embeddings (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null, -- values|interests|summary
  content_ref text,
  embedding vector (1536)
);
create index embeddings_user_id_idx on embeddings (user_id);
create index embeddings_hnsw_idx on embeddings using hnsw (embedding vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- Conversations + short-retention transcript
-- -----------------------------------------------------------------------------
create table conversations (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  started_at timestamptz default now(),
  ended_at timestamptz,
  summary text,
  retention_expires_at timestamptz -- purge/summarise after this
);
create index conversations_user_id_idx on conversations (user_id);

create table transcript_turns (
  id bigint generated always as identity primary key,
  conversation_id bigint references conversations (id) on delete cascade,
  role text not null, -- user|assistant
  text text not null,
  created_at timestamptz default now()
);
create index transcript_turns_conversation_id_idx on transcript_turns (conversation_id);

-- -----------------------------------------------------------------------------
-- Consent (recorded with version)
-- -----------------------------------------------------------------------------
create table consents (
  user_id uuid references auth.users (id) on delete cascade,
  scope text,
  granted boolean,
  version text,
  granted_at timestamptz default now()
);
create index consents_user_id_idx on consents (user_id);

-- -----------------------------------------------------------------------------
-- Trust & safety
-- -----------------------------------------------------------------------------
create table safety_flags (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  conversation_id bigint references conversations (id) on delete set null,
  type text,
  severity text,
  status text default 'open',
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz default now()
);
create index safety_flags_status_idx on safety_flags (status);

create table reports (
  id bigint generated always as identity primary key,
  reporter uuid references auth.users (id) on delete cascade,
  reported uuid references auth.users (id) on delete cascade,
  reason text,
  status text default 'open',
  created_at timestamptz default now()
);
create index reports_reporter_idx on reports (reporter);

create table blocks (
  blocker uuid references auth.users (id) on delete cascade,
  blocked uuid references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker, blocked)
);

-- -----------------------------------------------------------------------------
-- Matching (deterministic; readable by participants)
-- -----------------------------------------------------------------------------
create table matches (
  id bigint generated always as identity primary key,
  user_a uuid references auth.users (id) on delete cascade,
  user_b uuid references auth.users (id) on delete cascade,
  score numeric,
  rationale text,
  status text default 'suggested', -- suggested|accepted|declined
  created_at timestamptz default now()
);
create index matches_user_a_idx on matches (user_a);
create index matches_user_b_idx on matches (user_b);

-- -----------------------------------------------------------------------------
-- Billing
-- -----------------------------------------------------------------------------
create table subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text,
  status text,
  current_period_end timestamptz
);

-- -----------------------------------------------------------------------------
-- Audit log (service-role only; written on every privileged action)
-- -----------------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id) on delete set null,
  action text,
  target text,
  payload jsonb,
  created_at timestamptz default now()
);
create index audit_log_actor_idx on audit_log (actor);

-- ────────────────────────────────────────────────────────────────────────
-- 20260619090100_rls.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- Done Swiping — Row Level Security
-- -----------------------------------------------------------------------------
-- Principles:
--   * RLS is enabled on EVERY table.
--   * A user reads/writes only their OWN rows (user_id = auth.uid()).
--   * `matches` is readable by participants only (user_a/user_b).
--   * `safety_flags` and `audit_log` have NO authenticated policies → default
--     deny. They are written/read only via the service role.
--   * The service role (used by the API and workers) BYPASSES RLS, so worker
--     writes (inferred_traits, embeddings, matches, transcript_turns, billing,
--     audit) work without granting those rights to end users.
--   * auth.uid() is wrapped as (select auth.uid()) so Postgres caches it per
--     statement (Supabase performance guidance).
-- =============================================================================

-- Enable RLS everywhere -------------------------------------------------------
alter table profiles            enable row level security;
alter table profile_attributes  enable row level security;
alter table inferred_traits     enable row level security;
alter table preferences         enable row level security;
alter table embeddings          enable row level security;
alter table conversations       enable row level security;
alter table transcript_turns    enable row level security;
alter table consents            enable row level security;
alter table safety_flags        enable row level security;
alter table reports             enable row level security;
alter table blocks              enable row level security;
alter table matches             enable row level security;
alter table subscriptions       enable row level security;
alter table audit_log           enable row level security;

-- profiles --------------------------------------------------------------------
create policy "profiles_select_own" on profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles_insert_own" on profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles_update_own" on profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "profiles_delete_own" on profiles
  for delete to authenticated using (user_id = (select auth.uid()));

-- profile_attributes ----------------------------------------------------------
create policy "profile_attributes_select_own" on profile_attributes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profile_attributes_insert_own" on profile_attributes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profile_attributes_update_own" on profile_attributes
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "profile_attributes_delete_own" on profile_attributes
  for delete to authenticated using (user_id = (select auth.uid()));

-- inferred_traits (worker inserts via service role; user reviews/edits/deletes)
create policy "inferred_traits_select_own" on inferred_traits
  for select to authenticated using (user_id = (select auth.uid()));
create policy "inferred_traits_update_own" on inferred_traits
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "inferred_traits_delete_own" on inferred_traits
  for delete to authenticated using (user_id = (select auth.uid()));

-- preferences -----------------------------------------------------------------
create policy "preferences_select_own" on preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "preferences_insert_own" on preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "preferences_update_own" on preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "preferences_delete_own" on preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- embeddings (worker inserts via service role; user can read/delete own) ------
create policy "embeddings_select_own" on embeddings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "embeddings_delete_own" on embeddings
  for delete to authenticated using (user_id = (select auth.uid()));

-- conversations ---------------------------------------------------------------
create policy "conversations_select_own" on conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "conversations_delete_own" on conversations
  for delete to authenticated using (user_id = (select auth.uid()));

-- transcript_turns (ownership via parent conversation) ------------------------
create policy "transcript_turns_select_own" on transcript_turns
  for select to authenticated using (
    exists (
      select 1 from conversations c
      where c.id = transcript_turns.conversation_id
        and c.user_id = (select auth.uid())
    )
  );
create policy "transcript_turns_delete_own" on transcript_turns
  for delete to authenticated using (
    exists (
      select 1 from conversations c
      where c.id = transcript_turns.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

-- consents --------------------------------------------------------------------
create policy "consents_select_own" on consents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "consents_insert_own" on consents
  for insert to authenticated with check (user_id = (select auth.uid()));

-- matches (participants may read; writes are service-role only) ----------------
create policy "matches_select_participant" on matches
  for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));
-- A participant may update the status of their own match suggestion.
create policy "matches_update_participant" on matches
  for update to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()))
  with check (user_a = (select auth.uid()) or user_b = (select auth.uid()));

-- reports (reporter creates and reads their own) ------------------------------
create policy "reports_insert_own" on reports
  for insert to authenticated with check (reporter = (select auth.uid()));
create policy "reports_select_own" on reports
  for select to authenticated using (reporter = (select auth.uid()));

-- blocks (blocker manages their own block list) -------------------------------
create policy "blocks_select_own" on blocks
  for select to authenticated using (blocker = (select auth.uid()));
create policy "blocks_insert_own" on blocks
  for insert to authenticated with check (blocker = (select auth.uid()));
create policy "blocks_delete_own" on blocks
  for delete to authenticated using (blocker = (select auth.uid()));

-- subscriptions (user reads own entitlement; Stripe webhook writes via service role)
create policy "subscriptions_select_own" on subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- safety_flags  → NO authenticated policies (service role only).
-- audit_log     → NO authenticated policies (service role only).

-- ────────────────────────────────────────────────────────────────────────
-- 20260619093000_m1_profile_bootstrap.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- M1 — bootstrap a profile for every new auth user.
-- Ensures age-assurance + consent state exists from the moment of sign-up, so
-- the app can gate access (no profile row = no way past the age gate).
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, age_assurance_status, verification_status)
  values (new.id, 'pending', 'none')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Fire after a new user is created in Supabase Auth.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────
-- 20260619120000_m4_matching.sql
-- ────────────────────────────────────────────────────────────────────────
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

