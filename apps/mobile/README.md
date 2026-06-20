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

## Native build requirement for LiveKit / voice screen (M2)

`@livekit/react-native` depends on `@livekit/react-native-webrtc`, which contains native iOS and Android code (C++ WebRTC). **This will NOT run in Expo Go or the web platform.**

The voice screen (`app/onboarding/voice.tsx`) requires a **development client build** (or production build):

```bash
# 1. Generate native projects (run once, or after any native dep change)
pnpm --filter @done-swiping/mobile exec expo prebuild

# 2a. iOS — requires Xcode 15+ and an Apple Developer account
pnpm ios

# 2b. Android — requires Android Studio and a connected device / emulator
pnpm android
```

Alternatively, build via EAS Build (no local Xcode/Android Studio needed):

```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

### Microphone permissions

- **iOS:** The `NSMicrophoneUsageDescription` is already set in `app.json`. The native permission prompt appears automatically on first microphone publish.
- **Android:** `RECORD_AUDIO` is declared in `app.json`. The voice screen requests the permission at runtime via `PermissionsAndroid` before the session starts.

### What does NOT work without a native build

| Feature | Expo Go | Web | Dev build |
|---|---|---|---|
| Auth, age-gate, consent | Works | Works | Works |
| Matches, memory screens | Works | Works | Works |
| Voice session (LiveKit) | **No** | **No** | **Yes** |

## Screen → milestone map

| Screen | File | Milestone |
|---|---|---|
| Sign In | `app/(auth)/sign-in.tsx` | M0 (email done); M1 (Apple/Google) |
| Sign Up | `app/(auth)/sign-up.tsx` | M0 (email done); M1 (Apple/Google) |
| Age Gate | `app/onboarding/age-gate.tsx` | M1 (IDV provider integration) |
| Consent | `app/onboarding/consent.tsx` | M1 (real API consent recording) |
| Voice Onboarding | `app/onboarding/voice.tsx` | M2 (LiveKit + /session/start) — **dev build required** |
| Matches | `app/matches/index.tsx` | M4 (GET /matches, accept/decline) — **done** |
| Memory | `app/memory/index.tsx` | M3 (GET/PUT/DELETE /memory, export) — **done** |
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

## M4 Matches screen

The Matches screen (`app/matches/index.tsx`) shows AI-suggested matches with
compatibility scores and acceptance rationale. It lets users act on each suggestion.

### Card anatomy

| Element | Details |
|---|---|
| **Display label** | `Match #<last-6-of-UUID>` — a stable placeholder until profile-sharing rules are defined (`TODO(M4)` in source). |
| **Compatibility score** | Percentage (e.g. `87% compatible`) colour-coded green ≥ 85%, amber ≥ 65%, grey below. |
| **Why you matched** | Prominent rationale line from the server — every card must show this (acceptance criterion). |
| **Status badge** | `Connected` (green pill) or `Passed` (grey pill) once actioned; replaces buttons on acted cards. |

### Accept / Decline

- Buttons appear only on `suggested` matches.
- Tapping **Connect** (accept) or **Pass** (decline) applies an **optimistic UI update**
  immediately, then calls `supabase.from('matches').update({ status }).eq('id', id)`.
- The `matches_update_participant` RLS policy allows a participant (`user_a` or `user_b`)
  to update the `status` column of their own match row; no extra API endpoint is needed.
- On Supabase error the previous state is **rolled back** and an inline error banner appears.

### Other behaviours

- **Loading state**: full-screen `ActivityIndicator` on first load.
- **Pull-to-refresh**: `RefreshControl` re-fetches `GET /matches`.
- **Empty state**: encouraging message when the server returns no matches.
- **Error state**: inline red banner with a "Try again" button; re-runs the fetch.
- **My profile** button (top-right) navigates to `/memory` (preserved from M3).

## M5 Safety: report / block

The `ReportBlockMenu` component (`components/ReportBlockMenu.tsx`) surfaces a "⋯" overflow button on every match card that lets a user take safety actions against another user without leaving the Matches screen.

### Trigger

A small `⋯` `Pressable` appears in the top-right of each match card header, next to the status badge. It is always visible (including on actioned cards) so users can block or report even after accepting or declining.

### Actions

| Action | Flow |
|---|---|
| **Report** | Opens a reason text-input (up to 1 000 characters, validated). On submit calls `POST /report` with the other user's UUID + reason. Shows an in-sheet success message or an inline error. |
| **Block** | Shows a native `Alert` confirm dialog. On confirm calls `POST /block`. On success the card is **optimistically removed** from the list (the server already excludes blocked users from future `GET /matches` responses). On API error an `Alert` is shown. |

### Implementation

- `components/ReportBlockMenu.tsx` is a self-contained functional component. It uses only RN primitives: `Modal` (bottom-sheet-style, `animationType="fade"`), `TextInput`, `Pressable`, `Alert`, `ActivityIndicator`.
- No new dependencies introduced.
- `lib/api.ts` already exports `report(input: ReportInput)` and `block(input: BlockInput)`, both validated against the shared Zod schemas (`reportInputSchema`, `blockInputSchema`) from `@done-swiping/shared`.

### Screen → milestone map update

| Screen | File | Milestone |
|---|---|---|
| Matches (report/block) | `app/matches/index.tsx`, `components/ReportBlockMenu.tsx` | M5 — **done** |

## Key architectural notes

- **Compliance gating** is enforced in `app/index.tsx`. The flow is: auth → age assurance → consent → main app. None of these gates can be skipped.
- **Gate state** (`lib/useGateState.ts`) reads directly from Supabase with RLS — no extra API call needed for reads; the hook returns `refresh()` to re-poll after IDV/consent changes.
- **AI disclosure** (`AiDisclosureBanner`) is a compliance component (EU AI Act Art. 50). It appears on the consent screen and must remain permanently visible on the voice screen. It must not be dismissible.
- **Metro config** (`metro.config.js`) is monorepo-aware: it watches the workspace root and sets `nodeModulesPaths` to resolve pnpm-hoisted packages.
- **Shared types/schemas** (`@done-swiping/shared`) are imported directly by both the API and mobile app — one source of truth for wire formats.

## M3 Memory screen

The Memory screen (`app/memory/index.tsx`) lets users inspect, edit, delete, and export
everything the AI companion has learned about them.

### Three sections

| Section | Source | Visual indicator |
|---|---|---|
| Stated | Things the user said directly | Plain white card |
| Inferred | Model proposals from conversation | Purple-tinted card + "AI suggested" tag + confidence bar |
| Preferences | Desired partner traits / dealbreakers | Plain card + hard-filter toggle |

### Key behaviours

- **Pull-to-refresh** re-fetches `GET /memory`.
- **Inferred items** show a confidence bar (colour-coded green/amber/red) and a status
  badge (active / contradicted / decayed). The user can Correct (edit the `trait_value`)
  or Remove.
- **Preferences** have a hard-filter `Switch`. Toggling calls `PUT /memory/:id` with
  `is_hard_filter`. The label explicitly states "only you can set this, never the AI"
  (compliance: the AI must never set hard filters).
- **Delete** shows a confirmation alert noting the deletion is permanent and removes the
  item from AI embeddings on the server (`DELETE /memory/:id?kind=...`).
  See `TODO(M3)` in the file for the embedding-purge verification note.
- **Export my data** (GDPR) calls `GET /memory/export` and opens the native Share sheet.
  On platforms where Share is unavailable (web), a scrollable modal shows the raw JSON
  with selectable text as a copy fallback.
- **Navigation**: a "My profile" button in the top-right of the Matches screen pushes
  `/memory`.
