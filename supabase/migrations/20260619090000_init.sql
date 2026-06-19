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
