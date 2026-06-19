# @done-swiping/mobile

Expo / React Native app for Done Swiping — a voice-first AI dating app (UK-first, regulated). Built on **Expo SDK 52** with `expo-router` (file-based routing).

## Running the app

```bash
# From the monorepo root:
pnpm --filter @done-swiping/mobile dev

# Or from this directory:
pnpm dev          # Expo DevTools (choose platform interactively)
pnpm android      # Android emulator
pnpm ios          # iOS simulator
pnpm web          # Browser (Metro bundler)
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public — safe to ship in the binary) |
| `EXPO_PUBLIC_API_URL` | Base URL for the Done Swiping API (`apps/api`) |

**Never add** the Supabase service-role key here — it bypasses Row Level Security and must only exist server-side.

## Native build requirement for LiveKit (WebRTC)

`@livekit/react-native` depends on `@livekit/react-native-webrtc`, which contains native iOS and Android modules. **This will NOT run in Expo Go.**

To test voice features you need a **development build**:

```bash
# 1. Generate native projects
pnpm --filter @done-swiping/mobile exec expo prebuild

# 2a. iOS (requires Xcode + Apple Developer account)
pnpm ios

# 2b. Android (requires Android Studio / connected device)
pnpm android
```

Alternatively use EAS Build:
```bash
npx eas build --profile development --platform ios
```

The web platform (`pnpm web`) works for all non-audio screens and the demo, but voice sessions are native-only.

## Screen → milestone map

| Screen | File | Milestone |
|---|---|---|
| Sign In | `app/(auth)/sign-in.tsx` | M0 (email done); M1 (Apple/Google) |
| Sign Up | `app/(auth)/sign-up.tsx` | M0 (email done); M1 (Apple/Google) |
| Age Gate | `app/onboarding/age-gate.tsx` | M1 (IDV provider integration) |
| Consent | `app/onboarding/consent.tsx` | M1 (real API consent recording) |
| Voice Onboarding | `app/onboarding/voice.tsx` | M2 (LiveKit + /session/start) |
| Matches | `app/matches/index.tsx` | M4 (GET /matches, accept/decline) |
| Memory | `app/memory/index.tsx` | M3 (GET/PUT/DELETE /memory) |
| Paywall | `app/paywall/index.tsx` | M6 (Stripe Checkout + deep-link) |

## M1 compliance gate

M1 implements the legal gate that every user must pass before reaching the app.

### Gate flow

```
sign-in / sign-up
      │
      ▼
app/index.tsx  (gate evaluator — runs on every navigation to /)
      │
      ├─ no session          → /(auth)/sign-in
      ├─ ageStatus ≠ 'pass'  → /onboarding/age-gate   (UK Online Safety Act)
      ├─ consent incomplete  → /onboarding/consent     (GDPR Art. 7 + Art. 9)
      └─ all pass            → /matches
```

Gate state is read directly from Supabase (RLS: each user sees only their own rows):
- `profiles.age_assurance_status` — set by the Yoti webhook via the API
- `consents` table — `data_processing`, `special_category`, `ai_companion` must all be `granted = true` at `CONSENT_VERSION`

### Testing the age-gate in development

Because the real Yoti check requires a native build, M1 includes a dev-only escape hatch:

1. Run the API (`pnpm --filter @done-swiping/api dev`) — it must be running for the button to work.
2. Sign in (or sign up) in the app.
3. On the age-gate screen you will see a purple **"Simulate pass (dev only)"** button below the main "Start age check" button.
4. Tap it — the API calls `POST /idv/dev/complete` which flips `profiles.age_assurance_status` to `'pass'` for your user.
5. The gate automatically advances to the consent screen.

This button is wrapped in `if (__DEV__)` and is **invisible in production builds**.

### Real Yoti check (production / native build)

The "Start age check" button calls `POST /idv/session` and opens the returned `url` via `expo-linking`. For the production App Store build:

- Run `pnpm --filter @done-swiping/mobile exec expo prebuild` to generate native projects.
- Integrate the **Yoti Mobile SDK** (iOS + Android) and replace the `Linking.openURL` call in `app/onboarding/age-gate.tsx` with the SDK's native flow (look for the `TODO(M1)` comment).
- A Yoti account and API credentials are required — see [yoti.com/developers](https://developers.yoti.com).

## Key architectural notes

- **Compliance gating** is enforced in `app/index.tsx`. The flow is: auth → age assurance → consent → main app. None of these gates can be skipped.
- **Gate state** (`lib/useGateState.ts`) reads directly from Supabase with RLS — no extra API call needed for reads; the hook returns `refresh()` to re-poll after IDV/consent changes.
- **AI disclosure** (`AiDisclosureBanner`) is a compliance component (EU AI Act Art. 50). It appears on the consent screen and must remain permanently visible on the voice screen. It must not be dismissible.
- **Metro config** (`metro.config.js`) is monorepo-aware: it watches the workspace root and sets `nodeModulesPaths` to resolve pnpm-hoisted packages.
- **Shared types/schemas** (`@done-swiping/shared`) are imported directly by both the API and mobile app — one source of truth for wire formats.
