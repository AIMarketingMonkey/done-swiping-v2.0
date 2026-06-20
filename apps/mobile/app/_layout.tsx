// Root layout — provides SafeAreaProvider, auth state, entitlement state, and
// the root Stack.
//
// Auth state is read from Supabase and exposed via AuthContext so any screen
// can check session/profile without prop-drilling.
//
// Entitlement state is exposed via EntitlementContext so the paywall and any
// gated screen can read premium status and call refresh() after the Stripe
// deep-link returns.
//
// Deep-link handling (M6):
//   Stripe bounces through the API back to doneswiping://paywall?status=...
//   We listen for that URL here, call entitlement.refresh() when status=success,
//   and navigate to /paywall so the user sees their updated premium state.

import { getEntitlement } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { EntitlementResponse } from '@done-swiping/shared';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True while the initial session check is in flight. */
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Entitlement context (M6)
// ---------------------------------------------------------------------------

interface EntitlementContextValue {
  premium: boolean;
  status: string | null;
  loading: boolean;
  refresh: () => void;
}

const EntitlementContext = createContext<EntitlementContextValue>({
  premium: false,
  status: null,
  loading: true,
  refresh: () => {},
});

export function useEntitlementContext(): EntitlementContextValue {
  return useContext(EntitlementContext);
}

// ---------------------------------------------------------------------------
// Root layout component
// ---------------------------------------------------------------------------

export default function RootLayout(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Entitlement state lifted here so the deep-link handler can refresh it.
  const [entitlement, setEntitlement] = useState<Pick<EntitlementResponse, 'premium' | 'status'>>({
    premium: false,
    status: null,
  });
  const [entitlementLoading, setEntitlementLoading] = useState(false);
  const [entitlementTick, setEntitlementTick] = useState(0);

  const router = useRouter();
  // Track whether we've already navigated for this URL to avoid double-fires.
  const lastHandledUrl = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // ---------------------------------------------------------------------------
  // Entitlement fetch (re-runs when entitlementTick changes)
  // ---------------------------------------------------------------------------

  const refreshEntitlement = useCallback(() => setEntitlementTick((t) => t + 1), []);

  useEffect(() => {
    // Only fetch when a session exists.
    if (!session) {
      setEntitlement({ premium: false, status: null });
      return;
    }

    let cancelled = false;
    setEntitlementLoading(true);

    getEntitlement()
      .then((data) => {
        if (cancelled) return;
        setEntitlement({ premium: data.premium, status: data.status });
      })
      .catch(() => {
        if (cancelled) return;
        setEntitlement({ premium: false, status: null });
      })
      .finally(() => {
        if (!cancelled) setEntitlementLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, entitlementTick]);

  // ---------------------------------------------------------------------------
  // Deep-link return from Stripe (M6)
  // doneswiping://paywall?status=success|cancel|portal
  // ---------------------------------------------------------------------------

  const handleDeepLink = useCallback(
    (url: string): void => {
      if (url === lastHandledUrl.current) return;

      const parsed = Linking.parse(url);
      // Match the path regardless of whether the host is in the URL
      // (doneswiping://paywall → path='paywall', host='paywall')
      const path = parsed.path ?? parsed.hostname ?? '';
      const status =
        typeof parsed.queryParams?.status === 'string' ? parsed.queryParams.status : null;

      if (path !== 'paywall' && path !== '/paywall') return;

      lastHandledUrl.current = url;

      if (status === 'success') {
        // Refresh entitlement so the paywall screen shows the activated state.
        refreshEntitlement();
      }

      // Navigate to the paywall screen so the user sees the result in all cases.
      router.push('/paywall');
    },
    [refreshEntitlement, router],
  );

  // Listen for URLs while the app is foregrounded.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => subscription.remove();
  }, [handleDeepLink]);

  // Handle the initial URL if the app was cold-started from a deep link.
  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleDeepLink(url);
      })
      .catch(() => {});
  }, [handleDeepLink]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaProvider>
      <AuthContext.Provider
        value={{ session, user: session?.user ?? null, loading: authLoading, signOut }}
      >
        <EntitlementContext.Provider
          value={{
            premium: entitlement.premium,
            status: entitlement.status,
            loading: entitlementLoading,
            refresh: refreshEntitlement,
          }}
        >
          <Stack screenOptions={{ headerShown: false }} />
        </EntitlementContext.Provider>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}
