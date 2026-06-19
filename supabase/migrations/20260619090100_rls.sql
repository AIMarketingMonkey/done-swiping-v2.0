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
