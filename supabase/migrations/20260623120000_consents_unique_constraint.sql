-- =============================================================================
-- Add the missing unique (user_id, scope) constraint to `consents`.
--
-- POST /consent records consent rows with an upsert using
-- `onConflict: 'user_id,scope'`. Postgres requires a matching unique (or
-- exclusion) constraint for ON CONFLICT to resolve against; the original init
-- migration created `consents` with only a non-unique index, so the upsert
-- raised error 42P10 and the endpoint returned HTTP 500
-- ("Could not save your consent").
--
-- This patch adds the constraint to an existing database WITHOUT recreating any
-- table, so no data is lost. It is idempotent — safe to run more than once.
-- =============================================================================
set search_path = public;

alter table public.consents
  drop constraint if exists consents_user_id_scope_key;

alter table public.consents
  add constraint consents_user_id_scope_key unique (user_id, scope);
