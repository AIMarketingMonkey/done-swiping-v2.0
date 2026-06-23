# Claude for Chrome — Task: Fix Done Swiping's Supabase Auth redirect

**You are operating a logged-in browser session for a non-technical user.** Your
job is to debug and fix one specific problem in the **Supabase dashboard**, using
only the dashboard UI. Follow this brief exactly. Do not improvise beyond it.

---

## 1. TL;DR (what's broken and the fix)

After a user signs up / logs in on the Done Swiping web app
(`https://done-swiping-web.onrender.com`), they get redirected to an **old Vercel
app** that is no longer used.

The app code contains **no Vercel reference** — the redirect comes entirely from
**Supabase Auth settings**. The cause is one or more of:

1. The **Site URL** (and/or a **Redirect URL**) in Supabase Auth still points at a
   `*.vercel.app` address.
2. **"Confirm email" is ON**, so signup sends an email whose link bounces through
   that stale Site URL → lands on Vercel.
3. The settings were previously edited in the **wrong Supabase project** (the user
   has two projects).
4. A **custom email template** has a hard-coded Vercel link.

**The fix:** confirm you're in the correct project, point the Site URL + Redirect
URLs at the Render app, remove every `vercel.app` value, turn off email
confirmation (test mode), check the email templates, and delete the stale test
user. Then verify a fresh signup lands inside the app and never touches Vercel.

---

## 2. Known-good values (use these exactly)

| Setting | Correct value |
|---|---|
| **Correct Supabase project ref** | `nhpequaeddkasqgsdrii` (the *new* project) |
| **Wrong/old project ref — DO NOT EDIT** | `txnvpmoichprixbnnifb` |
| **Web app URL** | `https://done-swiping-web.onrender.com` |
| **API URL** | `https://done-swiping-api.onrender.com` |
| **Site URL (target)** | `https://done-swiping-web.onrender.com` |
| **Redirect URLs (target)** | `https://done-swiping-web.onrender.com/**` and `doneswiping://**` |
| **Mobile deep-link scheme** | `doneswiping://` |
| **Confirm email (for testing)** | **OFF** |
| **Anything containing** | `vercel.app` → **remove** |

---

## 3. STEP 0 — Confirm you're in the correct project (do this first)

Two projects exist. Editing the wrong one is the most likely reason an earlier
attempt "didn't work." Confirm which project the live app actually uses:

**Authoritative check (browser-native):**
1. Open a new tab → go to `https://done-swiping-web.onrender.com`.
2. Open **DevTools → Network** tab, then reload and try to sign in.
3. Find any request to a host like `https://XXXXXXXX.supabase.co`.
4. The `XXXXXXXX` subdomain **is the project ref the app uses.** It should be
   `nhpequaeddkasqgsdrii`.

Then in Supabase (`https://supabase.com/dashboard`) make sure the project you open
matches that ref (visible in the project's URL/Settings). **If the live app's ref
is *not* `nhpequaeddkasqgsdrii`, STOP and report the ref you found** — do not guess
which project to edit.

All edits below happen **inside that one matching project.**

---

## 4. STEP 1 — Fix the Auth URL configuration

1. Left sidebar → **Authentication**.
2. Click **URL Configuration**.
3. **Site URL:** if it contains a `vercel.app` address (or anything other than the
   Render URL), replace it with exactly:
   ```
   https://done-swiping-web.onrender.com
   ```
4. **Redirect URLs:**
   - **Delete every entry that contains `vercel.app`.**
   - Ensure these two exist (add them if missing):
     ```
     https://done-swiping-web.onrender.com/**
     doneswiping://**
     ```
5. Click **Save**. Note in your report the *old* Site URL value you replaced.

---

## 5. STEP 2 — Turn OFF email confirmation (test mode)

This removes the email step entirely, so there is no link to click and nowhere to
bounce — the surest way to stop the Vercel redirect during testing.

1. **Authentication** → **Sign In / Providers** (may be labelled **Providers**).
2. Click the **Email** provider to expand it.
3. Toggle **OFF** the setting **"Confirm email"** (sometimes "Enable email
   confirmations").
4. Click **Save**.

---

## 6. STEP 3 — Check email templates for a hard-coded Vercel link

Even with confirmation off now, fix this so re-enabling it later is safe.

1. **Authentication** → **Emails** (or **Email Templates**).
2. Open the **"Confirm signup"** template (also check **"Magic Link"** and
   **"Invite user"** if present).
3. If the template body contains a hard-coded `https://...vercel.app/...` link,
   replace that URL with the Supabase variable so it follows the Site URL:
   ```
   {{ .ConfirmationURL }}
   ```
   (Do **not** invent new template logic — only swap a hard-coded Vercel URL for
   `{{ .ConfirmationURL }}`. If there is no Vercel URL in the template, leave it
   unchanged.)
4. Save any template you changed.

---

## 7. STEP 4 — Delete the stale test user

The user's earlier test account may be tied to the old setting and block a clean
re-test.

1. **Authentication** → **Users**.
2. **Only** delete obvious test accounts (e.g. the email the user has been testing
   with). **If you are unsure whether an account is a real user, do NOT delete it —
   list it in your report instead.**

---

## 8. STEP 5 — Verify the fix (acceptance criteria)

1. Open an **incognito/private window** → `https://done-swiping-web.onrender.com`.
2. **Sign up** with a fresh test email + password.
3. ✅ **Pass:** you land **inside the app** — the first screen is the **age
   verification** screen (it shows a 🪪 icon and an "Age verification required"
   heading). You are **never** taken to a `vercel.app` page.
4. ❌ **Fail:** any redirect to a `*.vercel.app` URL, or an email confirmation step
   still appears.

Confirm the final state matches this checklist:
- [ ] Editing project ref `nhpequaeddkasqgsdrii` (matches the live app)
- [ ] Site URL = `https://done-swiping-web.onrender.com`
- [ ] No `vercel.app` value remains in Site URL or Redirect URLs
- [ ] Redirect URLs include the Render `/**` and `doneswiping://**`
- [ ] "Confirm email" is OFF
- [ ] Email templates contain no hard-coded Vercel link
- [ ] Fresh incognito signup reaches the age-gate screen, not Vercel

---

## 9. Guardrails — stay strictly inside scope

**DO**
- Edit **only** the project whose ref matches the live app (`nhpequaeddkasqgsdrii`).
- Change **only**: Auth → URL Configuration, the Email provider's "Confirm email"
  toggle, Email templates (Vercel-link swap only), and deleting clear test users.

**DO NOT**
- Touch the **other** Supabase project (`txnvpmoichprixbnnifb`) or any unrelated
  project.
- Open or modify: the **SQL Editor**, **Database/tables**, **RLS policies**,
  **Storage**, **API keys / secrets**, **billing**, or **project settings/deletion**.
- Reveal, copy, or screenshot the **service-role key** or any secret.
- Delete a user you cannot confirm is a test account.
- Proceed if the live app's project ref does **not** match — **stop and report.**

If any screen looks different from this brief or a step is ambiguous, **pause and
report what you see** rather than guessing.

---

## 10. Report back

When done (or if you stop early), give the user a short summary:
- Which **project ref** you edited (and how you confirmed it's the live one).
- The **old Site URL** you replaced and any **Redirect URLs removed**.
- Whether **"Confirm email"** was already off or you turned it off.
- Any **email template** you changed.
- Which **test user(s)** you deleted (or flagged but did not delete).
- The **verification result**: did a fresh incognito signup reach the age-gate
  screen without hitting Vercel? If not, exactly what happened.

---

### Context for the agent (optional reading)
Done Swiping is a voice-first dating app hosted on **Render** (web + API),
**Supabase** (auth + database), and **LiveKit** (voice). The age-verification
screen you should land on after signup is **intentional** and required — it is not
a bug. Your task is solely to remove the leftover **Vercel** redirect from the
**Supabase Auth** configuration.
