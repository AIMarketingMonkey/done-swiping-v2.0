# Run-book — running Done Swiping locally (end-to-end)

This is the step-by-step for running the app on your own machine, where there's
no network firewall, so the voice loop / matching / payments actually work.

> Do **Phase A** first — it gets the *voice loop* (the whole point of the app)
> working. Phases B–D add memory/matching, payments, and the staff console.

---

## 0. Prerequisites (install once)

- **Node 22** + **pnpm 10** (`corepack enable` then `corepack prepare pnpm@latest --activate`)
- **Python 3.11** + **uv** (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Xcode** (for iOS) or **Android Studio** (for Android) — the voice screen needs a
  native build; it will **not** run in Expo Go or a web browser
- A phone or simulator/emulator

```bash
git clone <your repo> done-swiping && cd done-swiping
git checkout claude/funny-dirac-9ni02r
pnpm install
cd services/voice-agent && uv sync && cd ../..
```

---

## 1. Environment files (your keys live here, never committed)

Create **three** `.env` files. The keys you already put in the cloud
environment go into the local root `.env` here.

### a) Root `.env` (server-side — API + voice agent read this)
```bash
cp .env.example .env
```
Fill in (★ = required for the voice loop):
```
★ SUPABASE_URL=...            ★ SUPABASE_ANON_KEY=...
★ SUPABASE_SERVICE_ROLE_KEY=...   SUPABASE_DB_URL=...   (pooler URI; for the RLS test)
★ ANTHROPIC_API_KEY=...
★ DEEPGRAM_API_KEY=...
★ LIVEKIT_URL=wss://<your-project>.livekit.cloud   ★ LIVEKIT_API_KEY=...   ★ LIVEKIT_API_SECRET=...
★ ELEVENLABS_API_KEY=...      ELEVENLABS_VOICE_ID=<a voice id>   ELEVENLABS_MODEL_ID=eleven_turbo_v2_5
  TTS_PROVIDER=elevenlabs     (elevenlabs | cartesia | ab)
  CARTESIA_API_KEY=...        (only if TTS_PROVIDER=cartesia|ab)   CARTESIA_VOICE_ID=...   CARTESIA_MODEL_ID=sonic-3
★ IDV_DEV_MODE=true           (lets you pass the age gate with a dev button — no Yoti needed)
  EMBEDDINGS_API_KEY=...      (OpenAI key — needed for Phase B matching)
  EMBEDDINGS_MODEL=text-embedding-3-small
  API_PUBLIC_URL=http://localhost:8787
  STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... STRIPE_PRICE_PREMIUM=...   (Phase C)
```
> ⚠️ You're currently missing `LIVEKIT_URL`, `ELEVENLABS_API_KEY`,
> `EMBEDDINGS_API_KEY`, and the `STRIPE_*` keys — grab those from each provider
> (see `docs/SETUP.md`). LiveKit/ElevenLabs accounts are free to start.

### b) `apps/mobile/.env` (the app — only public values)
```bash
cp apps/mobile/.env.example apps/mobile/.env
```
```
EXPO_PUBLIC_SUPABASE_URL=...        # same as SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=...   # the ANON key only — never the service role
EXPO_PUBLIC_API_URL=http://<YOUR-COMPUTER-LAN-IP>:8787
```
> On a **physical phone**, `localhost` won't reach your computer — use your
> machine's LAN IP (e.g. `http://192.168.1.20:8787`). On a simulator, `localhost` is fine
> (Android emulator: use `http://10.0.2.2:8787`).

### c) `apps/admin/.env` (Phase D only)
```bash
cp apps/admin/.env.example apps/admin/.env   # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_API_URL
```

---

## 2. Finish the database (2 outstanding migrations)

Your Supabase project already has the M0/M1 schema. Apply the two newer
migrations in the **Supabase SQL Editor** (paste each file, Run):
- `supabase/migrations/20260619120000_m4_matching.sql` (matching function)
- `supabase/migrations/20260620120001_m5_staff.sql` (`profiles.is_staff`)

*(Or, on a brand-new project, paste `supabase/setup_all.sql` once — it contains all four.)*

---

## Phase A — get the voice loop working (do this first)

**Terminal 1 — API**
```bash
pnpm --filter @done-swiping/api dev          # serves http://localhost:8787
pnpm --filter @done-swiping/api smoke        # (optional) verifies Anthropic + Deepgram + Supabase
```

**Terminal 2 — voice agent**
```bash
cd services/voice-agent && uv run python agent.py dev
```
You should see it connect to LiveKit and wait for a room.

**Terminal 3 — the app (native dev build)**
```bash
cd apps/mobile
npx expo prebuild              # generates native ios/android projects (first time only)
npx expo run:ios               # or: npx expo run:android  (builds + launches a dev build)
```

**Walk the flow on the device:**
1. Sign up (email + password).
2. Age gate → tap **"Simulate pass (dev only)"** (this works because `IDV_DEV_MODE=true`).
3. Consent → tick the required boxes → Continue.
4. You land on the **voice screen** → start talking to the companion.
   - ✅ Check: the AI **introduces itself as an AI** at the start (disclosure).
   - ✅ Check: you can **interrupt** it (barge-in) and it stops.
   - ✅ Check: turn latency feels natural.

If the agent doesn't answer: confirm Terminal 2 is connected, and that
`LIVEKIT_URL`/key/secret and `CARTESIA_API_KEY` are set in the root `.env`.

---

## Phase B — memory & matching

1. After a conversation ends, the agent triggers extraction. Open the **Memory**
   screen → you should see **stated** facts and **AI-suggested (inferred)** traits
   with confidence. Edit / delete one (delete also purges embeddings).
2. Matching needs **≥2 users with embeddings**, so repeat sign-up + a short
   conversation as a **second** test user. Then open **Matches** on either account
   → each match shows a score + a "why you matched" line. Try report/block.
   - Requires `EMBEDDINGS_API_KEY` (extraction generates the vectors).
3. Verify isolation any time: `pnpm --filter @done-swiping/api test:rls`.

---

## Phase C — payments (Stripe test mode)

1. In Stripe (test mode): create a **Product** + recurring **Price** → set
   `STRIPE_PRICE_PREMIUM=price_...` in root `.env`.
2. Forward webhooks locally:
   ```bash
   stripe listen --forward-to localhost:8787/webhooks/stripe
   ```
   Copy the `whsec_...` it prints → `STRIPE_WEBHOOK_SECRET` (restart the API).
3. Enable the **Customer Portal** in the Stripe dashboard.
4. In the app, hit the free voice limit (3 conversations) → you're routed to the
   **paywall** → Subscribe → complete Stripe Checkout (test card `4242 4242 4242 4242`)
   → you deep-link back and premium unlocks (unlimited voice).

---

## Phase D — staff moderation console

```bash
# make your account staff (after signing up), in the SQL Editor:
update public.profiles set is_staff = true
where user_id = (select id from auth.users where email = 'YOUR_EMAIL');

pnpm --filter @done-swiping/admin dev        # opens the console; log in with that account
```
Reports/flags you raised in the app appear here; action them (reviewing/actioned/dismissed).

---

## Common gotchas
- **App can't reach the API** → use your LAN IP (not `localhost`) in `apps/mobile/.env`.
- **Voice screen crashes on open** → you're in Expo Go; you need the `expo run:ios/android` dev build.
- **No matches** → need ≥2 users who've each had a conversation, and `EMBEDDINGS_API_KEY` set.
- **Agent silent** → check Terminal 2 logs; verify `LIVEKIT_URL` + TTS key.
- **402 on starting a call** → that's the free-tier limit working; subscribe (Phase C) or raise `FREE_VOICE_SESSION_LIMIT`.

When you hit a snag, paste the error and I'll help debug.
