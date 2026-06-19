/**
 * RLS isolation test — proves that Supabase Row-Level Security prevents one
 * user from reading another user's `profiles` or `consents` rows.
 *
 * Run with:
 *   pnpm --filter @done-swiping/api test:rls
 *
 * Requirements:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  — to create/delete test users
 *   SUPABASE_ANON_KEY                         — to sign in as each user and run
 *                                               RLS-subject queries
 *
 * If the service-role vars are missing the script exits 0 with a SKIPPED notice
 * so CI passes when secrets are not present.
 */

import { config } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: path.resolve(process.cwd(), '.env') });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let exitCode = 0;

function pass(msg: string): void {
  console.log(`  PASS  ${msg}`);
}

function fail(msg: string): void {
  console.error(`  FAIL  ${msg}`);
  exitCode = 1;
}

async function assert(label: string, fn: () => Promise<boolean>): Promise<void> {
  try {
    const ok = await fn();
    if (ok) {
      pass(label);
    } else {
      fail(label);
    }
  } catch (err) {
    fail(`${label} — threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const url = process.env['SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const anonKey = process.env['SUPABASE_ANON_KEY'];

  if (!url || !serviceKey) {
    console.log(
      'SKIPPED (no Supabase creds) — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run RLS tests.',
    );
    process.exit(0);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Unique emails so parallel CI runs don't clash.
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const emailA = `rls-test-a-${suffix}@example.invalid`;
  const emailB = `rls-test-b-${suffix}@example.invalid`;
  const password = `Test-${suffix}-!`;

  const userAId: string[] = [];
  const userBId: string[] = [];

  console.log('\nDone Swiping — RLS isolation test\n');

  try {
    // -----------------------------------------------------------------------
    // Create two test users via the admin API
    // -----------------------------------------------------------------------
    console.log('Creating test users ...');

    const { data: ua, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA || !ua.user) throw new Error(`Failed to create user A: ${errA?.message}`);
    userAId.push(ua.user.id);

    const { data: ub, error: errB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (errB || !ub.user) throw new Error(`Failed to create user B: ${errB?.message}`);
    userBId.push(ub.user.id);

    console.log(`  User A: ${ua.user.id}`);
    console.log(`  User B: ${ub.user.id}`);

    if (!anonKey) {
      console.log(
        '\nNOTE: SUPABASE_ANON_KEY is missing — skipping authenticated-isolation assertions.\n' +
          '      Set it to fully verify RLS.\n',
      );
      return;
    }

    // -----------------------------------------------------------------------
    // Sign in as each user using the anon key (RLS-subject sessions)
    // -----------------------------------------------------------------------
    console.log('\nSigning in as each user with the anon key ...');

    const clientA = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const clientB = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: signInErrA } = await clientA.auth.signInWithPassword({
      email: emailA,
      password,
    });
    if (signInErrA) throw new Error(`Failed to sign in as user A: ${signInErrA.message}`);

    const { error: signInErrB } = await clientB.auth.signInWithPassword({
      email: emailB,
      password,
    });
    if (signInErrB) throw new Error(`Failed to sign in as user B: ${signInErrB.message}`);

    // -----------------------------------------------------------------------
    // Seed a consent row for user B via the service-role client
    // -----------------------------------------------------------------------
    await admin.from('consents').insert({
      user_id: ub.user.id,
      scope: 'data_processing',
      granted: true,
      version: '2026-06-01',
      granted_at: new Date().toISOString(),
    });

    // -----------------------------------------------------------------------
    // Assertions
    // -----------------------------------------------------------------------
    console.log('\nRunning assertions ...\n');

    // (a) User A can read their own profiles row
    await assert('User A can read their own profiles row', async () => {
      const { data, error } = await clientA
        .from('profiles')
        .select('user_id')
        .eq('user_id', ua.user!.id);
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) === 1;
    });

    // (b) User A cannot read user B's profiles row (RLS blocks it)
    await assert("User A cannot read User B's profiles row (RLS blocks)", async () => {
      const { data, error } = await clientA
        .from('profiles')
        .select('user_id')
        .eq('user_id', ub.user!.id);
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) === 0;
    });

    // (c) User A cannot read user B's consents rows (RLS blocks it)
    await assert("User A cannot read User B's consents rows (RLS blocks)", async () => {
      const { data, error } = await clientA
        .from('consents')
        .select('user_id')
        .eq('user_id', ub.user!.id);
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) === 0;
    });

    // (d) User B can read their own consents row
    await assert('User B can read their own consents row', async () => {
      const { data, error } = await clientB
        .from('consents')
        .select('user_id')
        .eq('user_id', ub.user!.id);
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) === 1;
    });
  } finally {
    // -----------------------------------------------------------------------
    // Cleanup — always delete both test users
    // -----------------------------------------------------------------------
    console.log('\nCleaning up test users ...');
    for (const id of [...userAId, ...userBId]) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) {
        console.warn(`  WARNING: failed to delete user ${id}: ${error.message}`);
      } else {
        console.log(`  Deleted ${id}`);
      }
    }
  }
}

main()
  .then(() => {
    console.log(exitCode === 0 ? '\nAll assertions passed.\n' : '\nSome assertions FAILED.\n');
    process.exit(exitCode);
  })
  .catch((err) => {
    console.error('\nFatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
