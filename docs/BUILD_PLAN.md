# Build plan — milestones M0–M7

The MVP is **Phase 3 ("Private test MVP")**. Each milestone lists Code tasks and
acceptance criteria. Service setup (accounts/keys) is in `SETUP.md`.

## MVP definition of done

1. Sign up, pass a **facial age-assurance gate**, consent to data use.
2. **Voice onboarding** with the AI companion (clearly disclosed), turn latency feels natural (<~800ms).
3. Conversation transcribed; a **background worker extracts** structured fields + inferred traits + embeddings.
4. User can **see, edit and delete** their stored memory/profile.
5. **Deterministic matching** (hard filters + compatibility score) returns explainable matches.
6. **Per-turn moderation**; users can **report/block**; flags hit a review queue.
7. **Stripe web subscription** unlocks entitlement in the app.
8. All data in a **UK/EU region**; delete/export works.

Out of MVP scope: liveness "Verified" badge, LLM re-rank, model router, MCP, queues at scale.

---

## M0 — Foundations  ✅ (this scaffold)

- Monorepo (pnpm + turbo), `.env.example`, `CLAUDE.md`, CI lint/typecheck, Supabase local, schema + RLS.
- **Done when:** `pnpm install` clean; env vars present; `supabase start` runs; Anthropic + Deepgram "hello" calls succeed from a scratch script.

## M1 — Auth, profile, age gate, consent

- Supabase Auth (email + Apple/Google), run migrations + RLS, onboarding flow sign-up → **age assurance** → **consent**, IDV webhook sets `age_assurance_status`.
- **Done when:** a new user cannot enter the app until age assurance returns "pass" and consent is recorded; data lands in `profiles`/`consents`; RLS verified (user A cannot read user B).

## M2 — Voice loop (the core differentiator)

- LiveKit Agents (Python): Deepgram Flux STT → Claude Sonnet 4.6 → Cartesia TTS, barge-in; `POST /session/start` issues a LiveKit token; Expo screen joins; **AI disclosure** spoken + on-screen; per-turn Haiku safety check.
- **Done when:** a real spoken conversation runs end to end; turn latency ~<800ms; interrupting the AI stops its speech; disclosure is unmistakable.

## M3 — Transcript, memory & extraction

- Persist turns to `transcript_turns` (+ `retention_expires_at`); on session end enqueue the **extraction worker** (Haiku/Sonnet) → write `profile_attributes`, `inferred_traits` (confidence + `source_turn_id`), embeddings; Memory screen (view/edit/delete) + export/delete endpoints.
- **Done when:** structured fields + inferred traits appear after a conversation; user can edit/delete any item; export returns the user's data; a deleted item is gone from all stores (incl. embeddings).

## M4 — Matching (deterministic)

- Stage 1 hard filters (user-controlled), Stage 2 weighted compatibility + embedding similarity, Stage 4 safety gate; store results + plain-language rationale in `matches`; Matches screen.
- **Done when:** matches respect every hard filter exactly; each match shows a "why you matched" line; flagged/unverified users never surface.

## M5 — Safety tooling

- Report/block endpoints + UI; safety flags → `safety_flags` review queue; minimal staff-gated **moderation console** (web); **periodic AI-disclosure reminder** in long/emotional sessions.
- **Done when:** a user can report/block; flags appear in the queue; staff can action them; reminders fire per policy.

## M6 — Payments (web-first)

- Stripe Customer + Checkout (web) for tiers; `POST /webhooks/stripe` updates `subscriptions`; app reads entitlement and unlocks premium; deep-link back into the app.
- **Done when:** subscribing on the web flips the app to premium within seconds; cancel/renew reflected; webhook signature verified.

## M7 — Hardening for private beta

- Sentry, structured logging, rate limiting, zod validation everywhere, Postgres backups/PITR, secrets via host store, `audit_log` on every privileged action, basic analytics.
- **Done when:** errors tracked; abusive input rejected; every privileged action auditable; staging + prod separated.

---

## MVP acceptance checklist

- [ ] Sign-up blocked until age assurance passes; consent recorded.
- [ ] Real voice conversation, AI disclosed, latency ~<800ms, barge-in works.
- [ ] Transcript stored short-term; extraction populates stated + inferred profile + embeddings.
- [ ] Memory screen: view, edit, delete (across all stores), export.
- [ ] Matching respects every hard filter; each match has a rationale; unverified/flagged hidden.
- [ ] Per-turn moderation + report/block + review queue working.
- [ ] Web Stripe subscription unlocks premium in-app.
- [ ] All data UK/EU region; audit log on privileged actions; RLS verified.
