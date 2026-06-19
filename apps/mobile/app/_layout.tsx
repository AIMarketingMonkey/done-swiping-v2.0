// Root layout — provides SafeAreaProvider, auth state, and the root Stack.
// Auth state is read from Supabase and exposed via AuthContext so any screen
// can check session/profile without prop-drilling.

import { supabase } from '@/lib/supabase';
import { Stack } from 'expo-router';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Session } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

interface AuthContextValue {
  session: Session | null;
  /** True while the initial session check is in flight. */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Root layout component
// ---------------------------------------------------------------------------

export default function RootLayout(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial session from storage.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    // Subscribe to auth changes (sign-in / sign-out / token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={{ session, loading }}>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}
