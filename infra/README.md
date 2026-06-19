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

## Environments

Keep **staging** and **prod** as separate apps/projects with separate Supabase
projects and separate keys. CI runs lint + typecheck on every push
(`.github/workflows/ci.yml`).
