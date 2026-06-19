# Supabase

Postgres + Auth + Storage + pgvector + RLS. **Hosted project must be in a
UK/EU region (London or Frankfurt).**

## Local dev

```bash
supabase start          # boots local Postgres/Auth/Studio in Docker
supabase migration up   # applies migrations/
supabase db reset       # wipe + re-apply migrations + seed.sql
```

Studio: http://127.0.0.1:54323

## Migrations

| File | Purpose |
| --- | --- |
| `20260619090000_init.sql` | pgvector + all tables + indexes |
| `20260619090100_rls.sql` | Row Level Security: own-row isolation, participants-only matches, service-role-only safety/audit |

Create a new migration with `supabase migration new <name>`. Never edit an
applied migration in place — add a new one.

## RLS model

- Every table has RLS enabled.
- End users (the `authenticated` role) touch only their own rows.
- `matches` is readable by its two participants.
- `safety_flags` and `audit_log` have **no** authenticated policies — they are
  service-role only.
- The API and the extraction/matching workers use the **service-role key**,
  which bypasses RLS. Never ship the service-role key to the client.
