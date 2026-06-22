# Infra

Deployment config for the API and voice agent. **Everything UK region.**

## Targets

| Service | Runtime | Suggested host | Region |
| --- | --- | --- | --- |
| `apps/api` | Node (Hono) | Fly.io / Render | London (`lhr`) |
| `services/voice-agent` | Python (LiveKit Agents) | Fly.io / Render | London (`lhr`) |
| Postgres / Auth / Storage | Supabase managed | Supabase | London / Frankfurt |

## Files

- `fly/api.fly.toml` — Fly.io template for the API.
- `fly/voice-agent.fly.toml` — Fly.io template for the voice agent.
- `render.yaml` — Render blueprint (alternative to Fly).

## Secrets

Never bake secrets into images. Set them in the host's secret store:

```bash
# Fly
fly secrets set ANTHROPIC_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... --app done-swiping-api

# Render: dashboard → Environment, or render.yaml envVars with sync:false
```

## Deploy to Render

1. Push the repo to GitHub (or connect via the Render dashboard).
2. In the Render dashboard, click **New → Blueprint** and point it at the repo root.
   Render will read `infra/render.yaml` and create all four services automatically.
3. After the blueprint is created, go to each service's **Environment** tab and fill
   in every variable marked `sync: false` (see the blueprint for the full list).
   Key secrets to set before the first deploy:
   - `done-swiping-api`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `ANTHROPIC_API_KEY`,
     `LIVEKIT_URL/API_KEY/API_SECRET`, `STRIPE_*`, `IDV_*`, `SENTRY_DSN`.
     Then set `API_PUBLIC_URL` to the service's own `.onrender.com` URL.
   - `done-swiping-voice-agent`: `LIVEKIT_*`, `DEEPGRAM_API_KEY`,
     `ANTHROPIC_API_KEY`, `CARTESIA_*`, `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`.
   - `done-swiping-web`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
     `EXPO_PUBLIC_API_URL` (set to the api service URL).
   - `done-swiping-admin`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
     `VITE_API_URL` (set to the api service URL).
4. Trigger a manual deploy of `done-swiping-api` first; once its URL is known,
   update `API_PUBLIC_URL`, `EXPO_PUBLIC_API_URL`, and `VITE_API_URL` accordingly,
   then redeploy the static sites.

The API Docker build context is the **repo root** (so pnpm workspace resolution
works). The voice-agent build context is `services/voice-agent`.

## Environments

Keep **staging** and **prod** as separate apps/projects with separate Supabase
projects and separate keys. CI runs lint + typecheck on every push
(`.github/workflows/ci.yml`).
