# Hardening & operations (M7)

Operational guide for running Done Swiping safely in staging and production.
Pairs with the code-level hardening in `apps/api` (Sentry, rate limiting,
structured logging, analytics) and `services/voice-agent`.

## Observability

- **Error tracking — Sentry.** Set `SENTRY_DSN` on the API and the voice agent.
  Both initialise Sentry only when the DSN is present (no-op otherwise). The API
  captures unhandled errors via Hono's `onError`; clients still get a generic
  500. **Never** send transcript content, prompts, or secrets to Sentry.
- **Structured logs.** The API emits JSON logs (method, path, status, duration,
  requestId) and structured event logs. Ship them to your host's log drain.
- **Analytics.** `track(event, …)` currently logs a structured `analytics` line
  (stub). Forward to a real sink (PostHog/Amplitude/warehouse) before public
  beta. Keep PII out of event props.

## Abuse & input safety

- **zod validation at every boundary** (done across api + shared).
- **Rate limiting** on abuse-prone routes (`/session/start`, `/idv/session`,
  `/consent`, `/report`, `/block`, `/billing/checkout`). The MVP limiter is
  **in-memory (per-instance)** — for multi-instance production, move it to a
  shared store (Redis/Upstash). Webhooks are exempt (provider retries).
- **Moderation** (M5): per-turn Haiku safety, report/block, review queue.

## Secrets

- Secrets live only in the **host secret store** (Fly `fly secrets`, Render
  env), never in the repo. `.env` is git-ignored; `.env.example` documents shape.
- The **service-role key** and `STRIPE_*`/`SUPABASE_SERVICE_ROLE_KEY` never ship
  to the client. Rotate keys on staff offboarding or suspected exposure.

## Data protection (compliance)

- **UK/EU region** for all data (Supabase London/Frankfurt) — non-negotiable.
- **Encryption** in transit (TLS) and at rest (Supabase default).
- **No long-term raw audio**; transcripts carry `retention_expires_at` and are
  summarised/deleted after it.
- **Field-level encryption** for special-category disclosures: recommended for
  free-text sensitive fields. Approach: application-layer envelope encryption
  (KMS-managed key) on the most sensitive columns. `TODO` before public beta.
- **GDPR rights**: memory review/edit/delete + export are implemented (M3);
  deletion purges embeddings too.
- **Audit log** on every privileged action (M1–M6); review periodically.

## Backups & disaster recovery

- Enable **Supabase PITR** (Point-in-Time Recovery) on a paid plan for prod.
- Verify daily logical backups; **practice a restore** into a scratch project at
  least once before public beta (an untested backup isn't a backup).
- Document RPO/RTO targets; keep them realistic for a founder-run service.

## Environments

- Separate **staging** and **prod**: distinct Supabase projects, distinct keys,
  Stripe **test vs live**, separate LiveKit projects. Never point staging at prod
  data.
- CI (`.github/workflows/ci.yml`) runs lint + typecheck on every push.
- Deploy via `infra/` (Fly.io `lhr` / Render `frankfurt`).

## Incident response (lightweight)

1. Triage via Sentry + logs; identify blast radius.
2. If credentials may be exposed: rotate immediately (Supabase, Stripe, LiveKit,
   Anthropic, Deepgram).
3. For a safety incident: action via the moderation console (M5); preserve the
   `audit_log` and relevant `safety_flags`.
4. Post-incident: write a short note in this repo (what happened, fix, follow-up).

## Pre-public-beta checklist

- [ ] Sentry DSNs set (api + voice agent); errors flowing
- [ ] Rate limiting moved to a shared store if running >1 instance
- [ ] Analytics forwarded to a real sink
- [ ] Field-level encryption on sensitive disclosures
- [ ] Supabase PITR on; restore drill done
- [ ] Staging/prod fully separated; secrets only in host stores
- [ ] Age-assurance vendor wired (replacing the dev-mock) — see `docs/DECISIONS.md`
- [ ] Live end-to-end test on a device/dev build (voice loop, matching, payments)
