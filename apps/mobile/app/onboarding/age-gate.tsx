// Age assurance gate — MUST be passed before the user can access any app
// features. Uses Yoti facial age-estimation (privacy-preserving: no image
// is stored, only the age-pass result is shared with us).
//
// Required by the UK Online Safety Act (Highly Effective Age Assurance).
//
// Flow:
//   1. User taps "Start age check".
//   2. We call POST /idv/session to create a Yoti session.
//   3. If the response has a `url`, we open it with Linking.openURL (web flow).
//      TODO(M1): Production Yoti integration uses the Yoti Mobile SDK via a
//      native/dev build (expo prebuild). The SDK flow is more seamless (no
//      browser handoff) and is required for App Store approval. The url-based
//      flow here is suitable for dev/demo only.
//   4. When the user returns, we call refresh() to re-read profiles.age_assurance_status.
//   5. On 'pass' the gate hook in index.tsx advances automatically.
//      On 'fail' we show a friendly error + retry.
//
// __DEV__ only: a secondary "Simulate pass (dev)" button calls
//   POST /idv/dev/complete to flip the status without a real Yoti check.
//   This button MUST NOT appear in production builds.

import { Screen } from '@/components/Screen';
import * as api from '@/lib/api';
import { notify } from '@/lib/dialog';
import { useGateState } from '@/lib/useGateState';
import { useAuth } from '@/app/_layout';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function AgeGate(): React.JSX.Element {
  const router = useRouter();
  const { session } = useAuth();
  const { ageStatus, refresh } = useGateState(session?.user.id);
  const [starting, setStarting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [waitingForReturn, setWaitingForReturn] = useState(false);

  // Dev/test age bypass. Shown only when the build was exported with
  // EXPO_PUBLIC_IDV_DEV_MODE=true (or in a local __DEV__ build). This MUST match
  // the API's IDV_DEV_MODE — it reveals a one-tap "simulate pass" so the gate can
  // be exercised without a real age vendor. The server still enforces the gate;
  // set this to false (and wire a vendor) before going to real production.
  const idvDevMode = __DEV__ || process.env.EXPO_PUBLIC_IDV_DEV_MODE === 'true';

  async function handleStartCheck(): Promise<void> {
    setStarting(true);
    try {
      const idvSession = await api.startIdvSession();

      if (idvSession.url) {
        // Hosted Yoti web flow — open in the system browser.
        // TODO(M1): Replace with Yoti Mobile SDK call in native/dev build.
        //   The SDK provides a seamless in-app flow and is required for
        //   production (App Store + Play Store). Run `expo prebuild` first.
        await Linking.openURL(idvSession.url);
        // After returning from the browser, poll for the updated status.
        setWaitingForReturn(true);
      } else {
        // SDK token flow — client_session_token is available for native SDK.
        // TODO(M1): Pass idvSession.client_session_token to the Yoti SDK here.
        notify(
          'Native SDK required',
          'The Yoti age-check SDK requires a development build (expo prebuild). ' +
            'Use the "Simulate pass" button in development.',
        );
      }
    } catch (_err) {
      notify('Error', 'Could not start the age check. Please try again.');
    } finally {
      setStarting(false);
    }
  }

  async function handleRefreshAfterReturn(): Promise<void> {
    setWaitingForReturn(false);
    refresh();
    // index.tsx re-evaluates the gate automatically when ageStatus changes.
    // Navigate to root so the gate re-runs.
    router.replace('/');
  }

  // __DEV__ only — simulate a pass without a real Yoti check.
  async function handleSimulatePass(): Promise<void> {
    setSimulating(true);
    try {
      await api.devCompleteIdv('pass');
      refresh();
      router.replace('/');
    } catch (_err) {
      notify('Dev error', 'Could not simulate pass. Is the API running?');
    } finally {
      setSimulating(false);
    }
  }

  // Show a return-from-browser confirmation step.
  if (waitingForReturn) {
    return (
      <Screen style={styles.content}>
        <Text style={styles.heading}>Verification in progress</Text>
        <Text style={styles.body}>
          Complete the check in your browser, then tap below to continue.
        </Text>
        <Pressable style={styles.primaryButton} onPress={handleRefreshAfterReturn}>
          <Text style={styles.primaryButtonText}>I've completed the check</Text>
        </Pressable>
      </Screen>
    );
  }

  // Show the status when we already know it (e.g. after a failed attempt).
  const isFailed = ageStatus === 'fail';

  return (
    <Screen style={styles.content}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🪪</Text>
      </View>

      <Text style={styles.heading}>Age verification required</Text>

      {isFailed ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            The age check did not pass. You must be 18 or over to use Done Swiping. If you believe
            this is an error, please contact support.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.body}>
            Done Swiping is for adults aged 18 and over. To protect younger users we use a Yoti
            facial age-estimation check before you can continue.
          </Text>
          <Text style={styles.body}>
            The check takes less than a minute. No image is stored — only the age-pass result is
            shared with us (privacy-preserving by design).
          </Text>
        </>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Your biometric data is processed by Yoti solely to confirm you are 18+. It is not used for
          identification, profiling, or shared with third parties beyond the verification provider.
        </Text>
      </View>

      {idvDevMode ? (
        // Dev/test build: no real age vendor is wired yet, so expose a one-tap
        // simulate-pass (POST /idv/dev/complete). The server still enforces the
        // gate — this only flips the status so the flow can be tested.
        <Pressable
          style={[styles.primaryButton, simulating && styles.buttonDisabled]}
          onPress={handleSimulatePass}
          disabled={simulating}
        >
          {simulating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Simulate age pass (dev)</Text>
          )}
        </Pressable>
      ) : (
        <Pressable
          style={[styles.primaryButton, starting && styles.buttonDisabled]}
          onPress={handleStartCheck}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isFailed ? 'Try again' : 'Start age check'}
            </Text>
          )}
        </Pressable>
      )}

      <Text style={styles.footnote}>
        Required by the UK Online Safety Act. You cannot use Done Swiping until age assurance
        passes.
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
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 21,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  footnote: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
});
