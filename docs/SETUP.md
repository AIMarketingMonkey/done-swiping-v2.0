# Setup guide — accounts, API keys & external services

This is your checklist for everything that lives outside the code. **You** create
the accounts and enter anything sensitive; the code just needs the keys pasted
into `.env`.

> **Hard rule.** Account creation, passwords, card/bank details, accepting terms
> and granting OAuth consent are done **by you**, in the real console, every
> time. Never paste a secret into a chat or commit it to git. `.env` is
> git-ignored on purpose.

## How to use this

1. Copy the template: `cp .env.example .env`
2. Work top-to-bottom through the services below. Each one tells you the screen
   to open, what to click, and which `.env` variable to paste the result into.
3. You don't need everything at once — the **"Needed by"** column tells you the
   first milestone that requires each key. For the very first run you only need
   **Supabase**, **Anthropic** and **Deepgram**.

## Service → env var → milestone map

| Service | Purpose | `.env` vars | Needed by |
| --- | --- | --- | --- |
| **Supabase** | DB + Auth + Storage + pgvector | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | M0 |
| **Anthropic** | Brain + extraction/safety models | `ANTHROPIC_API_KEY` | M0 |
| **Deepgram** | Speech-to-text (Flux) | `DEEPGRAM_API_KEY` | M0/M2 |
| **LiveKit Cloud** | Realtime voice transport | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | M2 |
| **Cartesia** (and/or ElevenLabs) | Text-to-speech | `CARTESIA_API_KEY` / `ELEVENLABS_API_KEY` | M2 |
| **Embeddings** (OpenAI/Voyage/Gemini) | Vector embeddings | `EMBEDDINGS_API_KEY`, `EMBEDDINGS_MODEL` | M3 |
| **Yoti** or **Persona** | Age assurance / ID | `IDV_PROVIDER`, `IDV_API_KEY`, `IDV_WEBHOOK_SECRET` | M1 |
| **Stripe** | Subscriptions | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | M6 |
| **Google AI** (optional) | Gemini Live fallback | `GOOGLE_API_KEY` | later |
| **Sentry** | Error tracking | `SENTRY_DSN` | M7 |
| **Resend** | Transactional email | `RESEND_API_KEY` | M7 |
| **Expo** | Push notifications | `EXPO_PUSH_TOKEN` | M7 |
| **Fly.io / Render** | Hosting (API + voice agent) | host secret store | deploy |

---

## 1. Supabase — needed first (M0)

1. Sign in at https://supabase.com → **New project**.
2. **Region: choose London (`eu-west-2`) or Frankfurt (`eu-central-1`).** This is
   a compliance requirement — all data must stay in UK/EU. You cannot change it
   later without recreating the project.
3. Set a strong database password (save it in your password manager).
4. Once provisioned, open **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` *(server-only — never ships to the app)*
5. **Project Settings → Database → Connection string (URI)** → `SUPABASE_DB_URL`
   (use the connection-pooler URI for serverless).
6. Auth providers (Apple, Google) are configured in **M1** — see that milestone.

## 2. Anthropic — needed first (M0)

1. https://console.anthropic.com → **API keys** → **Create key**.
2. Paste into `ANTHROPIC_API_KEY`.
3. Confirm your account has access to `claude-sonnet-4-6` and
   `claude-haiku-4-5-20251001` (Models page). Add billing if required.

## 3. Deepgram — STT (M0/M2)

1. https://console.deepgram.com → **API Keys** → create a key → `DEEPGRAM_API_KEY`.
2. Confirm your project has access to **Flux** (streaming STT with end-of-turn).

## 4. LiveKit Cloud — voice transport (M2)

1. https://cloud.livekit.io → create a project (pick an EU region).
2. **Settings → Keys** → create → copy:
   - WebSocket URL (`wss://…`) → `LIVEKIT_URL`
   - API Key → `LIVEKIT_API_KEY`
   - API Secret → `LIVEKIT_API_SECRET`

## 5. Cartesia / ElevenLabs — TTS (M2)

- **ElevenLabs (primary):** https://elevenlabs.io → Profile → API key →
  `ELEVENLABS_API_KEY`. Pick a warm companion voice and note its voice ID
  (`ELEVENLABS_VOICE_ID`). Leave `TTS_PROVIDER=elevenlabs` (the default).
- **Cartesia (optional alternative / A/B):** https://play.cartesia.ai → API key →
  `CARTESIA_API_KEY`. Only needed when `TTS_PROVIDER=cartesia` or `ab`.

## 6. Embeddings (M3)

Default is OpenAI `text-embedding-3-small` (1536 dims — matches the schema).
1. https://platform.openai.com → API keys → `EMBEDDINGS_API_KEY`.
2. Leave `EMBEDDINGS_MODEL=text-embedding-3-small` (or swap to a Voyage/Gemini
   model — keep the vector column at 1536 dims, or we migrate the column).

## 7. Yoti or Persona — age assurance (M1)

Pick **one** provider (`IDV_PROVIDER=yoti` or `persona`).
1. Create an account and a **verification flow**: facial **age estimation** first,
   with ID + liveness as an escalation path.
2. Confirm the provider **discards biometric data** per GDPR.
3. Create an API key → `IDV_API_KEY`.
4. Set the **webhook URL** to `<API_PUBLIC_URL>/webhooks/idv` and copy the signing
   secret → `IDV_WEBHOOK_SECRET`.

## 8. Stripe — subscriptions (M6)

1. https://dashboard.stripe.com → create products/prices for the subscription tiers.
2. **Developers → API keys** → `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.
3. **Developers → Webhooks** → add endpoint `<API_PUBLIC_URL>/webhooks/stripe`
   (events: `checkout.session.completed`, `customer.subscription.*`) → copy the
   signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Enable **Stripe Tax (UK VAT)** and the **Customer Portal**.
5. *(You enter business + bank details — agents never do.)*

## 9. Ops — Sentry, Resend, Expo (M7)

- **Sentry:** https://sentry.io → project → DSN → `SENTRY_DSN`.
- **Resend:** https://resend.com → API key → `RESEND_API_KEY`; verify your sending domain.
- **Expo:** https://expo.dev → push credentials → `EXPO_PUSH_TOKEN`.

## 10. Hosting — Fly.io / Render (deploy)

- Create apps for **`api`** and **`voice-agent`** in a **UK region** (Fly: `lhr`).
- Put every secret from `.env` into the host's **secret store** (never in the image).
- See `infra/` for `fly.toml` templates and `render.yaml`.

## 11. (Optional) Cloudflare

DNS + WAF in front of the API domain.

---

## Verify your M0 keys

Once `SUPABASE_*`, `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` are set, run the
smoke test from the repo root:

```bash
pnpm --filter @done-swiping/api smoke
```

It makes a tiny Anthropic + Deepgram call and checks the Supabase connection,
without spending more than a fraction of a cent.
