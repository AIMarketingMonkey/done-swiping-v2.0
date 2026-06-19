/**
 * Smoke test — validates external service credentials without touching user data.
 * Run via: pnpm --filter @done-swiping/api smoke
 *
 * Each check is independent, prints a clear status symbol, and skips gracefully
 * when the relevant key is absent. No check throws on a missing key.
 * Cost is kept negligible (no generation, no writes).
 */

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(process.cwd(), '.env') });

const e = process.env;

const PASS = '✅'; // ✅
const SKIP = '⚠️'; // ⚠️
const FAIL = '❌'; // ❌

async function checkAnthropic(): Promise<void> {
  const apiKey = e['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    console.log(`${SKIP}  Anthropic — ANTHROPIC_API_KEY not set, skipping.`);
    return;
  }
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'say hi' }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.slice(0, 20) : '(non-text)';
    console.log(`${PASS}  Anthropic — OK (response: "${text}")`);
  } catch (err) {
    console.log(`${FAIL}  Anthropic — ${String(err)}`);
  }
}

async function checkDeepgram(): Promise<void> {
  const apiKey = e['DEEPGRAM_API_KEY'];
  if (!apiKey) {
    console.log(`${SKIP}  Deepgram — DEEPGRAM_API_KEY not set, skipping.`);
    return;
  }
  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (res.ok || res.status === 403) {
      // 403 = key valid but no project access (still proves key is accepted)
      console.log(`${PASS}  Deepgram — key accepted (HTTP ${res.status})`);
    } else {
      const body = await res.text();
      console.log(`${FAIL}  Deepgram — HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
  } catch (err) {
    console.log(`${FAIL}  Deepgram — ${String(err)}`);
  }
}

async function checkSupabase(): Promise<void> {
  const url = e['SUPABASE_URL'];
  const key = e['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.log(`${SKIP}  Supabase — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set, skipping.`);
    return;
  }
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    // Cheapest possible query: count 0 rows from profiles without fetching data.
    const { error } = await supabase
      .from('profiles')
      .select('user_id', { count: 'exact', head: true });
    if (error) {
      console.log(`${FAIL}  Supabase — query error: ${error.message}`);
    } else {
      console.log(`${PASS}  Supabase — reachable (profiles table accessible)`);
    }
  } catch (err) {
    console.log(`${FAIL}  Supabase — ${String(err)}`);
  }
}

async function main(): Promise<void> {
  console.log('\nDone Swiping API — smoke test\n');
  await checkAnthropic();
  await checkDeepgram();
  await checkSupabase();
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Smoke test runner error:', err);
  process.exit(1);
});
