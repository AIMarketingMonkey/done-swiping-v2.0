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
