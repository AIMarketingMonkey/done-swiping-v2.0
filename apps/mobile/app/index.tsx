// Entry point — routes the user to the correct screen based on auth and
// onboarding state. All routing decisions live here so the gating logic is
// visible in one place.
//
// Compliance gating (MUST NOT be removed or weakened):
//   1. Not signed in           → (auth)/sign-in
//   2. Age assurance not pass  → onboarding/age-gate      (UK Online Safety Act)
//   3. Consent not recorded    → onboarding/consent       (GDPR Art. 7 + Art. 9)
//   4. All gates passed        → /matches

import { useAuth } from '@/app/_layout';
import { useGateState } from '@/lib/useGateState';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function Index(): React.JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const { loading: gateLoading, ageStatus, hasRequiredConsent } = useGateState(session?.user.id);

  if (authLoading || (session && gateLoading)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // 1. Not signed in.
  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // 2. Age assurance gate — user MUST pass before proceeding (UK Online Safety Act).
  if (ageStatus !== 'pass') {
    return <Redirect href="/onboarding/age-gate" />;
  }

  // 3. Consent gate — GDPR explicit consent for special-category data (Art. 7 + Art. 9).
  if (!hasRequiredConsent) {
    return <Redirect href="/onboarding/consent" />;
  }

  // All gates passed → main app.
  return <Redirect href="/matches" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
