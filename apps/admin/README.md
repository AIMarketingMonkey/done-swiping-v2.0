# Done Swiping — Staff Moderation Console

Internal SPA for Done Swiping staff to review safety flags and user reports.
Built with Vite + React + TypeScript; uses the Supabase browser client for auth
and the Done Swiping Hono API for data.

## Prerequisites

- Node 20+, pnpm 9+
- A Done Swiping Supabase project and API deployment
- A staff account: the API checks `profiles.is_staff = true` on every admin
  endpoint — sign in with a user whose row has that column set

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL, e.g. `https://xyzabc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key (safe for the browser) |
| `VITE_API_URL` | Base URL for the Hono API, e.g. `https://api.done-swiping.com` |

## Running locally

```bash
# from the monorepo root
pnpm --filter @done-swiping/admin dev
```

Then open http://localhost:5173.

## Building for production

```bash
pnpm --filter @done-swiping/admin build
```

Output goes to `apps/admin/dist/`.

## What it does

- **Login screen** — email/password via Supabase Auth
- **Safety Flags table** — lists all `safety_flags` rows; staff can set each to
  Reviewing, Actioned, or Dismissed
- **User Reports table** — lists all `reports` rows; same action buttons
- API calls attach the Supabase session JWT as `Authorization: Bearer <token>`
- Shows "Not authorised (staff only)" if the API returns HTTP 403
- Data refreshes automatically after each action

## Staff access

The API checks `profiles.is_staff = true`. To grant access run:

```sql
update profiles set is_staff = true where user_id = '<uuid>';
```
