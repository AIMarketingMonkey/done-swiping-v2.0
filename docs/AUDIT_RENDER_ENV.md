# Claude for Chrome — Task: Audit & clean Done Swiping's Render env vars

**You are operating a logged-in browser session for a non-technical user.** Your
job is to audit the environment variables of **four Render services** and remove
every leftover reference to a **deleted old Supabase project** and a **retired
Vercel app**, replacing them with the correct current values. Use only the
Render and Supabase dashboard UIs. Follow this brief exactly; do not improvise.

---

## 1. Objective

The project was migrated to a new Supabase project, but some Render services may
still point at the **old, deleted** Supabase project or the **old Vercel** app.
Find and fix every such legacy reference across all four services, then make sure
each service redeploys with the corrected values.

## 2. The two legacy strings to hunt for

In **every** service's environment, any value containing either of these is WRONG
and must be fixed. Neither string should remain anywhere when you are done:

- 🚩 `txnvpmoichprixbnnifb` — the **old, deleted** Supabase project ref
- 🚩 `vercel` (e.g. `done-swiping.vercel.app`) — the **retired** prototype

## 3. Known-good values (the correct replacements)

| Thing | Correct value |
|---|---|
| **Supabase project ref (new)** | `nhpequaeddkasqgsdrii` |
| **Supabase URL** | `https://nhpequaeddkasqgsdrii.supabase.co` |
| **LiveKit URL** | `wss://done-swiping-v2-0-9ajlhzp2.livekit.cloud` |
| **API URL** | `https://done-swiping-api.onrender.com` |
| **Web URL** | `https://done-swiping-web.onrender.com` |
| **Deep link** | `doneswiping://` |
| **`APP_REGION`** | `uk` · **`IDV_DEV_MODE`/`EXPO_PUBLIC_IDV_DEV_MODE`** = `true` · **`TTS_PROVIDER`** = `elevenlabs` |

## 4. Where to read the correct secret values (Supabase)

Secret keys are **masked** in Render — you cannot read an existing key to check
which project it belongs to. So the rule is: **if a service's visible
`*_SUPABASE_URL` still shows the old ref, its key is almost certainly old too —
re-copy BOTH the URL and the matching key** from the new project.

Get the correct keys here: **Supabase → project `nhpequaeddkasqgsdrii` → Settings
→ API Keys → "Legacy API keys"**:
- **`anon` / public key** → for the **client** apps (web, admin)
- **`service_role` / secret key** → for the **server** apps (api, voice-agent) ONLY

> 🔐 **CRITICAL SECURITY RULE:** the **`service_role`** key must go **only** into
> `done-swiping-api` and `done-swiping-voice-agent`. **NEVER** put it into
> `done-swiping-web` or `done-swiping-admin` — those are shipped to the browser
> and must use the **anon** key only. Putting service_role in a client app would
> leak full database access publicly.

---

## 5. STEP 0 — Confirm access first

1. Open **https://dashboard.render.com**. Confirm you can see the services
   `done-swiping-api`, `done-swiping-voice-agent`, `done-swiping-web`,
   `done-swiping-admin`.
2. Open **https://supabase.com/dashboard** and confirm you can open project
   `nhpequaeddkasqgsdrii`.

**If you cannot access the Render dashboard, STOP and report that** — the user
will run the audit manually. Do not guess.

---

## 6. Method — for each of the four services

Open the service → left menu **Environment**. Read every variable's value. Apply
the table for that service below. For each variable:
- **Correct already?** Leave it. Note "OK" in your report.
- **Contains `txnvpmoichprixbnnifb` or `vercel`, or is wrong?** Fix it to the
  known-good value (re-copying keys from Supabase per Section 4 when needed).
- Click **Save Changes** when done with a service.

### Service 1 — `done-swiping-api`  (Web service)
| Variable | Correct value / action |
|---|---|
| `SUPABASE_URL` | `https://nhpequaeddkasqgsdrii.supabase.co` |
| `SUPABASE_ANON_KEY` | new project **anon** key (re-copy if `SUPABASE_URL` was old) |
| `SUPABASE_SERVICE_ROLE_KEY` | new project **service_role** key (re-copy if URL was old) |
| `SUPABASE_DB_URL` | If it contains `txnvpmoichprixbnnifb`: **do NOT guess a new value** (it needs a DB password). **Flag it in your report** — it is not used at runtime, so leave it untouched otherwise. |
| `LIVEKIT_URL` | `wss://done-swiping-v2-0-9ajlhzp2.livekit.cloud` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | leave unless `LIVEKIT_URL` was wrong; if wrong, get correct keys from LiveKit Cloud → project `done-swiping-v2-0` → Settings/Keys |
| `API_PUBLIC_URL` | `https://done-swiping-api.onrender.com` (fix if it shows vercel) |
| `WEB_ORIGIN` *(if present)* | `https://done-swiping-web.onrender.com` (fix if it shows vercel) |
| `IDV_DEV_MODE` / `APP_REGION` / `APP_DEEP_LINK` | `true` / `uk` / `doneswiping://` |

### Service 2 — `done-swiping-voice-agent`  (Worker)
| Variable | Correct value / action |
|---|---|
| `SUPABASE_URL` | `https://nhpequaeddkasqgsdrii.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | new project **service_role** key (re-copy if URL was old) |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | same LiveKit project as above |
| `TTS_PROVIDER` / `ELEVENLABS_API_KEY` | `elevenlabs` / leave the key as-is |
| `CARTESIA_API_KEY` / `CARTESIA_VOICE_ID` *(if present)* | 🧹 **Legacy — delete these variables.** The app uses ElevenLabs now; these are safe to remove. |

### Service 3 — `done-swiping-web`  (Static site)
| Variable | Correct value / action |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://nhpequaeddkasqgsdrii.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | new project **anon** key (NEVER service_role) |
| `EXPO_PUBLIC_API_URL` | `https://done-swiping-api.onrender.com` |
| `EXPO_PUBLIC_IDV_DEV_MODE` | `true` |

### Service 4 — `done-swiping-admin`  (Static site) — ⚠️ most likely still legacy
| Variable | Correct value / action |
|---|---|
| `VITE_SUPABASE_URL` | `https://nhpequaeddkasqgsdrii.supabase.co` (this service was never updated — expect the old ref here) |
| `VITE_SUPABASE_ANON_KEY` | new project **anon** key (NEVER service_role) |
| `VITE_API_URL` | `https://done-swiping-api.onrender.com` |

---

## 7. STEP — Make changes take effect

- **`done-swiping-api` and `done-swiping-voice-agent`:** saving env changes
  triggers an automatic redeploy. Confirm each returns to **Live**.
- **`done-swiping-web` and `done-swiping-admin` (static sites):** env vars are
  baked in **at build time**, so a plain save is not enough. For each one you
  changed, go to **Manual Deploy → Clear build cache & deploy**, and wait for
  **Live**.

## 8. STEP — Light verification

After all four are **Live**:
1. Open `https://done-swiping-web.onrender.com` in an incognito window.
2. Confirm the **sign-in screen loads** and you can reach it without any redirect
   to a `vercel.app` page. (You do not need to complete a full voice test.)

---

## 9. Guardrails — stay strictly in scope

**DO**
- Edit **only** these four services: `done-swiping-api`,
  `done-swiping-voice-agent`, `done-swiping-web`, `done-swiping-admin`.
- Change **only** values on each service's **Environment** tab (and trigger the
  redeploys in Section 7).

**DO NOT**
- Put the **`service_role`** key into `done-swiping-web` or `done-swiping-admin`.
- Reveal, copy, screenshot, or write secret key **values** into your report — refer
  to them by name only ("updated `SUPABASE_SERVICE_ROLE_KEY`").
- Change any **non-env setting**: build command, Dockerfile/runtime, instance
  type/scaling, region, health check, custom domains, disks, or delete/suspend any
  service.
- Touch any Render service, Supabase project, or other resource **not named here**
  (in particular, do not recreate or reference the deleted `txnvpmoichprixbnnifb`).
- Guess a value you cannot derive (e.g. `SUPABASE_DB_URL`'s password, or a LiveKit
  secret you can't read) — **flag it for the user instead.**

If a screen differs from this brief or a step is ambiguous, **pause and report**
rather than guessing.

---

## 10. Report back

Give the user a concise summary:
- **Access:** could you reach Render? Supabase?
- **Per service** (`api`, `voice-agent`, `web`, `admin`): for each variable you
  touched, what it was (legacy ref / vercel / wrong) → what you changed it to
  (by name, not secret values). List variables that were already **OK**.
- **Deleted:** any legacy vars you removed (e.g. `CARTESIA_*`).
- **Flagged, not changed:** anything you left for the user (e.g. `SUPABASE_DB_URL`
  still containing the old ref, or a LiveKit value you couldn't verify).
- **Rebuilds:** which static sites you "Clear build cache & deploy"-ed, and whether
  all four services returned to **Live**.
- **Verification:** did the web sign-in screen load with no Vercel redirect?

---

## 11. Verification pass (READ-ONLY — confirm the cleanup is complete)

This is a **read-only confirmation pass.** Make **NO changes** — just inspect each
item and report **✅ / ❌** with what you observed. If anything is ❌, the fix is in
Section 6 above; flag it for the user, do not silently change it in this pass.

**A — `done-swiping-admin` → Environment**
- `VITE_SUPABASE_URL` → ✅ if it reads `https://nhpequaeddkasqgsdrii.supabase.co`;
  ❌ if it contains `txnvpmoichprixbnnifb`.
- `VITE_SUPABASE_ANON_KEY` → present? (value is masked — you can't confirm the
  project by sight; confirm via check **E**). Confirm it's the **anon** key, never
  service_role.

**B — `done-swiping-voice-agent` → Environment**
- ✅ if **no** `CARTESIA_API_KEY` and **no** `CARTESIA_VOICE_ID` remain.
- Also note `TTS_PROVIDER` = `elevenlabs` and `ELEVENLABS_API_KEY` is present.

**C — `done-swiping-api` → Environment**
- ✅ if `SUPABASE_DB_URL` is either **absent** or no longer contains
  `txnvpmoichprixbnnifb`.

**D — Static-site rebuilds → each service's Events tab**
- `done-swiping-web` → Events **and** `done-swiping-admin` → Events: ✅ if the most
  recent **deploy** ran **after** the env changes were saved and the service shows
  **Live**.

**E — Gold-standard runtime check (admin)**
- Open the **done-swiping-admin** site (its `…onrender.com` URL, shown on the
  service page) in a normal tab → **DevTools → Network** → reload.
- ✅ if requests go to **`nhpequaeddkasqgsdrii.supabase.co`** (not
  `txnvpmoichprixbnnifb`), there is **no redirect to any `vercel.app`** page, and no
  401/404 from Supabase on load.

**Report format:** one line per check, e.g.
`A — ✅ VITE_SUPABASE_URL = https://nhpequaeddkasqgsdrii.supabase.co`
`B — ❌ CARTESIA_VOICE_ID still present`

---

### Context (optional reading)
Done Swiping is a voice-first dating app on **Render** (API + voice-agent +
web + admin), **Supabase** (database/auth, project `nhpequaeddkasqgsdrii`), and
**LiveKit** (voice). An older Supabase project (`txnvpmoichprixbnnifb`) and a
Vercel prototype were retired; this task removes their lingering references from
Render so every service points only at the current infrastructure.
