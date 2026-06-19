// Entry point — routes the user to the correct screen based on auth and
// onboarding state. All routing decisions live here so the gating logic is
// visible in one place.
//
// Compliance gating (MUST NOT be removed or weakened):
//   1. Not signed in           → (auth)/sign-in
//   2. Age assurance not pass  → onboarding/age-gate      (UK CSEA compliance)
//   3. Consent not recorded    → onboarding/consent       (GDPR Art. 7 + Art. 9)
//   4. Voice onboarding done?  → matches (main app)
//      Otherwise               → onboarding/voice

import { useAuth } from '@/app/_layout';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

// TODO(M1): Replace these placeholder flags with real profile/consent reads.
//   - ageAssuranceStatus: fetch from profiles table (age_assurance_status column)
//   - consentRecorded: check consent table for data_processing + special_category
//     grants at the current CONSENT_VERSION
//   - voiceOnboardingDone: check whether the user has completed at least one
//     voice session (e.g. a boolean column on the profiles row)
const PLACEHOLDER_AGE_ASSURANCE_STATUS = 'pending' as 'pending' | 'pass' | 'fail';
const PLACEHOLDER_CONSENT_RECORDED = false;
const PLACEHOLDER_VOICE_ONBOARDING_DONE = false;

export default function Index(): React.JSX.Element {
  const { session, loading } = useAuth();

  if (loading) {
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

  // 2. Age assurance gate — user MUST pass before proceeding.
  if (PLACEHOLDER_AGE_ASSURANCE_STATUS !== 'pass') {
    return <Redirect href="/onboarding/age-gate" />;
  }

  // 3. Consent gate — GDPR explicit consent for special-category data.
  if (!PLACEHOLDER_CONSENT_RECORDED) {
    return <Redirect href="/onboarding/consent" />;
  }

  // 4. Voice onboarding — first-run experience.
  if (!PLACEHOLDER_VOICE_ONBOARDING_DONE) {
    return <Redirect href="/onboarding/voice" />;
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
