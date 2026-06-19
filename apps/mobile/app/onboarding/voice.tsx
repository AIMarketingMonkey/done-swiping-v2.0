// Voice onboarding screen — the user's first conversation with the AI companion.
//
// COMPLIANCE: AiDisclosureBanner is rendered at the TOP and must remain visible
// throughout the session (EU AI Act Art. 50). Do not move it below the fold or
// allow the user to dismiss it.
//
// TODO(M2): Implement real voice session:
//   1. Call startSession() from lib/api.ts → get {livekit_url, token, room}
//   2. Call joinRoom(params) from lib/livekit.ts
//   3. Subscribe to AI audio track and play it
//   4. Publish the user's microphone when the mic button is pressed
//   5. Dispatch the AI_DISCLOSURE.spoken string via TTS at session start
//   6. Set up DISCLOSURE_REMINDER_INTERVAL_MS timer for periodic reminders
//   7. On session end, navigate to /matches

import { AiDisclosureBanner } from '@/components/AiDisclosureBanner';
import { Screen } from '@/components/Screen';
import { AI_DISCLOSURE } from '@done-swiping/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

type SessionState = 'idle' | 'connecting' | 'active' | 'ended';

export default function VoiceOnboarding(): React.JSX.Element {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [micActive, setMicActive] = useState(false);

  async function handleStartSession(): Promise<void> {
    setSessionState('connecting');
    try {
      // TODO(M2): Replace with real session start + LiveKit connection.
      //   const params = await startSession();
      //   await joinRoom(params);
      //   setSessionState('active');
      await new Promise<void>((resolve) => setTimeout(resolve, 800)); // placeholder
      setSessionState('active');
    } catch {
      setSessionState('idle');
      Alert.alert('Connection error', 'Could not connect to your session. Please try again.');
    }
  }

  function handleToggleMic(): void {
    if (sessionState !== 'active') return;
    // TODO(M2): Toggle microphone track publish on the LiveKit room.
    setMicActive((prev) => !prev);
  }

  function handleEndSession(): void {
    // TODO(M2): Disconnect from the LiveKit room, then navigate.
    setSessionState('ended');
    router.replace('/matches');
  }

  return (
    <View style={styles.root}>
      {/* Compliance banner — always at top, never hidden */}
      <AiDisclosureBanner />

      <Screen style={styles.content}>
        <Text style={styles.heading}>Meet your AI companion</Text>
        <Text style={styles.subtext}>
          Your AI companion will ask you a few questions to understand what you're looking for. The
          more you share, the better your matches will be.
        </Text>

        {/* Spoken disclosure — shown as text before session starts */}
        {sessionState === 'idle' && (
          <View style={styles.disclosureBox}>
            <Text style={styles.disclosureText}>"{AI_DISCLOSURE.spoken}"</Text>
          </View>
        )}

        {/* Session state UI */}
        {sessionState === 'idle' && (
          <Pressable style={styles.primaryButton} onPress={handleStartSession}>
            <Text style={styles.primaryButtonText}>Start conversation</Text>
          </Pressable>
        )}

        {sessionState === 'connecting' && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>Connecting…</Text>
          </View>
        )}

        {sessionState === 'active' && (
          <View style={styles.activeControls}>
            <Text style={styles.statusText}>Session active</Text>

            {/* Mic toggle button */}
            <Pressable
              style={[styles.micButton, micActive && styles.micButtonActive]}
              onPress={handleToggleMic}
              accessibilityRole="button"
              accessibilityLabel={micActive ? 'Mute microphone' : 'Unmute microphone'}
            >
              <Text style={styles.micIcon}>{micActive ? '🎙️' : '🔇'}</Text>
              <Text style={styles.micLabel}>{micActive ? 'Speaking' : 'Tap to speak'}</Text>
            </Pressable>

            <Pressable style={styles.endButton} onPress={handleEndSession}>
              <Text style={styles.endButtonText}>End conversation</Text>
            </Pressable>
          </View>
        )}

        {/* TODO(M2): Render live transcript / waveform visualiser here */}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    gap: 20,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtext: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  disclosureBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#7C3AED',
  },
  disclosureText: {
    fontSize: 14,
    color: '#374151',
    fontStyle: 'italic',
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  statusText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  activeControls: {
    gap: 20,
    alignItems: 'center',
  },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E5E7EB',
  },
  micButtonActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#7C3AED',
  },
  micIcon: {
    fontSize: 40,
  },
  micLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  endButton: {
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  endButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '500',
  },
});
