# Decisions log

Key product / architecture decisions, newest first.

## 2026-06-19

- **Age assurance — vendor deferred (Yoti rejected on cost).** Yoti's ~£200/mo
  minimum isn't justified pre-launch. The age-assurance **gate stays** — the UK
  Online Safety Act requires highly-effective age assurance for 18+ dating, so
  it's not optional. Implementation is provider-agnostic with a dev-mock
  (`IDV_DEV_MODE=true`) so development costs £0. Choose a pay-as-you-go provider
  (facial age estimation / Stripe Identity / Persona / VerifyMyAge) near launch.

- **Supabase — dedicated fresh project.** The first project already held a
  second, overlapping schema from another tool (`users`, `user_profiles`,
  `structured_profiles`, `profile_photos`, `user_preferences`, `likes`,
  `ai_conversations`, `ai_messages`). To avoid collision, this build uses its own
  clean project; the schema is applied via `supabase/setup_all.sql`.

- **Cloud sandbox egress is allowlisted.** This Claude Code web environment only
  permits outbound to Anthropic + Deepgram. Supabase (REST/Management) and
  LiveKit/Cartesia/ElevenLabs hosts are not reachable from the sandbox — so schema
  is applied via the Supabase SQL Editor, and live integration tests run on the
  developer's machine / a dev build (or after those hosts are added to egress).

- **TTS — A/B Cartesia + ElevenLabs.** Both wired behind the voice agent (M2) so
  they can be compared.
