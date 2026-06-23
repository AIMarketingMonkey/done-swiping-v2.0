# Deploy to the cloud (Render) — step by step

Everything runs in the cloud, built straight from this GitHub repo. No local
machine, no terminal — just dashboard clicks and pasting your keys.

## What gets created
Render reads `infra/render.yaml` and creates **four services** (region: Frankfurt/EU):

| Service | Type | What it is |
| --- | --- | --- |
| `done-swiping-api` | Web (Docker) | The API (public HTTPS) |
| `done-swiping-voice-agent` | Worker (Docker) | The voice agent (connects out to LiveKit) |
| `done-swiping-web` | Static site | The app users open (web URL, in-browser voice) |
| `done-swiping-admin` | Static site | Staff moderation console |

Supabase (database) and LiveKit (voice transport) are already cloud — Render just
connects to them with your keys.

## Step 1 — create the Blueprint
1. Sign in at https://render.com → **New → Blueprint**.
2. Connect your GitHub and pick this repo; choose the branch
   (`claude/funny-dirac-9ni02r`, or `main` if you merge first).
3. Render shows the four services from `infra/render.yaml` → **Apply**.

## Step 2 — paste your secrets
Each service has an **Environment** tab. Fill in the variables marked
`sync: false` (the blueprint lists them). The essentials:

- **`done-swiping-api`** — `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `ANTHROPIC_API_KEY`,
  `DEEPGRAM_API_KEY`, `LIVEKIT_URL/API_KEY/API_SECRET`, `EMBEDDINGS_API_KEY`,
  `IDV_DEV_MODE=true`, (later) `STRIPE_*`, `SENTRY_DSN`.
- **`done-swiping-voice-agent`** — `LIVEKIT_URL/API_KEY/API_SECRET`,
  `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `TTS_PROVIDER=elevenlabs`,
  `ELEVENLABS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `EMBEDDINGS_API_KEY`. (Cartesia keys only if you set `TTS_PROVIDER=cartesia|ab`.)
- **`done-swiping-web`** — `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` (the api's URL).
- **`done-swiping-admin`** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL` (the api's URL).

## Step 3 — first deploy + wire the URLs
1. Deploy **`done-swiping-api`** first. Render gives it a URL like
   `https://done-swiping-api.onrender.com`.
2. Put that URL into: `API_PUBLIC_URL` (api), `EXPO_PUBLIC_API_URL` (web),
   `VITE_API_URL` (admin). Redeploy the web + admin static sites.
3. The voice-agent worker starts on its own and connects to LiveKit.

## Step 4 — finish the database (once)
In the Supabase **SQL Editor**, run the two newer migrations if you haven't:
- `supabase/migrations/20260619120000_m4_matching.sql`
- `supabase/migrations/20260620120001_m5_staff.sql`

Make yourself staff (for the admin console):
```sql
update public.profiles set is_staff = true
where user_id = (select id from auth.users where email = 'YOUR_EMAIL');
```

## Step 5 — webhooks (when you do payments)
In Stripe, set the webhook endpoint to `https://<your-api-url>/webhooks/stripe`
(events: `checkout.session.completed`, `customer.subscription.*`) → copy the
signing secret into `STRIPE_WEBHOOK_SECRET`. Same pattern for the IDV provider
later (`/webhooks/idv`).

## Step 6 — your Hostinger domain
In Render, open `done-swiping-web` → **Settings → Custom Domains** → add e.g.
`app.yourdomain.com`. Render shows a **CNAME** target. In **Hostinger → DNS**, add
that CNAME record. (Do the same for the API/admin subdomains if you want pretty
URLs, and update the `*_API_URL` vars to match.)

## Notes
- **Free tier spins services down** after inactivity (cold starts of ~30s) — fine
  for testing, but for a voice app put `api` + `voice-agent` on the **Starter**
  plan ($7/mo each) so they stay warm.
- The **voice-agent worker must be running** for calls to work.
- To test: open the web URL → sign up → "Simulate pass (dev)" (because
  `IDV_DEV_MODE=true`) → consent → talk to the companion.
- Pushing to the connected branch auto-redeploys.
