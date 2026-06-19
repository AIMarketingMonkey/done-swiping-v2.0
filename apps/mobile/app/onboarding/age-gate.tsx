// Age assurance gate — MUST be passed before the user can access any app
// features. Uses a third-party facial age-assurance IDV provider.
//
// TODO(M1): Integrate IDV provider (e.g. Yoti, Veriff, or Onfido):
//   - Launch the provider's SDK/webview flow from the "Start verification" button.
//   - The provider webhooks back to POST /webhooks/idv (server-side).
//   - Poll or subscribe to the user's age_assurance_status on the profiles row.
//   - On 'pass', navigate to /onboarding/consent.
//   - On 'fail', show a friendly explanation that the user cannot proceed.

import { Screen } from '@/components/Screen';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

export default function AgeGate(): React.JSX.Element {
  function handleStartVerification(): void {
    // TODO(M1): Launch the IDV provider flow here.
    Alert.alert(
      'Verification not yet available',
      'Age assurance integration is coming in M1. This button will launch the IDV provider flow.',
    );
  }

  return (
    <Screen style={styles.content}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🪪</Text>
      </View>

      <Text style={styles.heading}>Age verification required</Text>
      <Text style={styles.body}>
        Done Swiping is for adults aged 18 and over. To protect younger users, we use a facial
        age-assurance check before you can continue.
      </Text>
      <Text style={styles.body}>
        The check takes less than a minute. No image is stored — only the age-pass result is shared
        with us.
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Your biometric data is processed solely to confirm you are 18+. It is not used for
          identification or shared with third parties beyond the verification provider.
        </Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={handleStartVerification}>
        <Text style={styles.primaryButtonText}>Start verification</Text>
      </Pressable>

      <Text style={styles.footnote}>
        You cannot use Done Swiping until age assurance passes. If you believe this is an error,
        contact support.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    gap: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 56,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  infoBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 14,
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
});
