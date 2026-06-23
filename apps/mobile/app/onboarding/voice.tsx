// Voice onboarding screen — the user's first conversation with the AI companion.
//
// COMPLIANCE: AiDisclosureBanner is rendered at the TOP and must remain visible
// throughout the session (EU AI Act Art. 50). Do not move it below the fold or
// allow the user to dismiss it.
//
// Architecture:
//   - startSession() (lib/api.ts) → POST /session/start → {livekit_url, token, room}
//   - <LiveKitRoom> handles room connection, audio publishing, and re-connection
//   - useConnectionState() drives the UI state indicator
//   - useLocalParticipant() gives isMicrophoneEnabled + localParticipant for mute toggle
//   - useVoiceAssistant() gives agent speaking state for the talking indicator
//
// TODO(M3): Wire live transcript — agentTranscriptions from useVoiceAssistant()
//           contains per-turn TranscriptionSegment[] from the agent's STT output.

import { AiDisclosureBanner } from '@/components/AiDisclosureBanner';
import { AgeGateError, PremiumRequiredError } from '@/lib/api';
import * as api from '@/lib/api';
import { notify } from '@/lib/dialog';
import { startAudioSession, stopAudioSession } from '@/lib/livekit';
import { AI_DISCLOSURE } from '@done-swiping/shared';
import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useVoiceAssistant,
} from '@livekit/react-native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScreenState =
  | { phase: 'requesting_permission' }
  | { phase: 'idle' }
  | { phase: 'connecting'; livekitUrl: string; token: string }
  | { phase: 'live'; livekitUrl: string; token: string }
  | { phase: 'error'; message: string; retryable: boolean }
  | { phase: 'ended' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // RECORD_AUDIO is always present on Android — the non-null assertion is safe
    // because this branch only runs when Platform.OS === 'android'.
    const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO!;
    const result = await PermissionsAndroid.request(permission, {
      title: 'Microphone access',
      message:
        'Done Swiping uses your microphone to talk with your AI companion during onboarding.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  // iOS: permission is requested implicitly by WebRTC when the track is first
  // published (NSMicrophoneUsageDescription in app.json). Return true to
  // unblock the flow — the native prompt appears on first publish.
  return true;
}

// ---------------------------------------------------------------------------
// Inner call-screen component (must be rendered inside <LiveKitRoom>)
// ---------------------------------------------------------------------------

interface CallControlsProps {
  onEnd: () => void;
}

function CallControls({ onEnd }: CallControlsProps): React.JSX.Element {
  const connectionState = useConnectionState();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const { state: agentState } = useVoiceAssistant();

  // Compare against string literal values — ConnectionState enum from livekit-client
  // is not re-exported by @livekit/react-native, so we use its underlying string values:
  //   'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'signalReconnecting'
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';
  const isLive = connectionState === 'connected';
  const isReconnecting = connectionState === 'reconnecting';

  async function handleToggleMic(): Promise<void> {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (_err) {
      notify('Microphone error', 'Could not toggle the microphone. Please try again.');
    }
  }

  // Connection state label
  let statusLabel = 'Connecting…';
  if (isReconnecting) statusLabel = 'Reconnecting…';
  else if (isLive) {
    if (agentState === 'speaking') statusLabel = 'AI companion is speaking';
    else if (agentState === 'thinking') statusLabel = 'Thinking…';
    else if (agentState === 'listening' || agentState === 'idle') statusLabel = 'Listening…';
    else statusLabel = 'Session active';
  }

  // Visual pulse: agent speaking → purple border, user speaking (mic on + live) → green
  const agentSpeaking = isLive && agentState === 'speaking';
  const userCanSpeak = isLive && isMicrophoneEnabled;

  return (
    <View style={styles.callControls}>
      {/* Connection / agent state indicator */}
      <View style={styles.statusRow}>
        {isConnecting && <ActivityIndicator size="small" color="#7C3AED" style={styles.spinner} />}
        <View
          style={[
            styles.statusDot,
            isLive && !isReconnecting && styles.statusDotLive,
            isReconnecting && styles.statusDotReconnecting,
          ]}
        />
        <Text style={styles.statusText}>{statusLabel}</Text>
      </View>

      {/* Talking/listening ring */}
      <View
        style={[
          styles.ring,
          agentSpeaking && styles.ringAgentSpeaking,
          !agentSpeaking && userCanSpeak && styles.ringUserSpeaking,
        ]}
      >
        <Text style={styles.ringIcon}>{isMicrophoneEnabled ? '🎙️' : '🔇'}</Text>
      </View>

      {/* TODO(M3): Render live transcript here — agentTranscriptions from
           useVoiceAssistant() contains per-segment text from the agent. */}

      {/* Mute / unmute */}
      <Pressable
        style={[styles.micButton, isMicrophoneEnabled && styles.micButtonActive]}
        onPress={() => void handleToggleMic()}
        accessibilityRole="button"
        accessibilityLabel={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        disabled={!isLive}
      >
        <Text style={styles.micLabel}>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</Text>
      </Pressable>

      {/* End call */}
      <Pressable
        style={styles.endButton}
        onPress={onEnd}
        accessibilityRole="button"
        accessibilityLabel="End conversation"
      >
        <Text style={styles.endButtonText}>End conversation</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

export default function VoiceOnboarding(): React.JSX.Element {
  const router = useRouter();
  const [screenState, setScreenState] = useState<ScreenState>({ phase: 'requesting_permission' });
  // Track whether audio session is active so we can tear it down on unmount.
  const audioSessionActive = useRef(false);

  // ---------------------------------------------------------------------------
  // Permission + session start
  // ---------------------------------------------------------------------------

  const startSession = useCallback(async () => {
    setScreenState({ phase: 'requesting_permission' });

    const granted = await requestMicPermission();
    if (!granted) {
      setScreenState({
        phase: 'error',
        message:
          'Microphone access is required for voice sessions. Please enable it in Settings and try again.',
        retryable: false,
      });
      return;
    }

    setScreenState({ phase: 'idle' });

    try {
      // Start the native audio session before connecting so routing is
      // correct from the first track. Safe to call multiple times.
      await startAudioSession();
      audioSessionActive.current = true;

      const params = await api.startSession();

      setScreenState({
        phase: 'connecting',
        livekitUrl: params.livekit_url,
        token: params.token,
      });
    } catch (err) {
      if (err instanceof AgeGateError) {
        // Age assurance gate is still blocking — send the user back.
        router.replace('/onboarding/age-gate');
        return;
      }
      if (err instanceof PremiumRequiredError) {
        // Free voice session limit reached — send the user to the paywall.
        router.replace({
          pathname: '/paywall',
          params: {
            message:
              "You've used all your free voice conversations. Upgrade to Premium for unlimited sessions with your AI companion.",
          },
        });
        return;
      }
      setScreenState({
        phase: 'error',
        message: 'Could not connect to your session. Please check your connection and try again.',
        retryable: true,
      });
    }
  }, [router]);

  // Kick off on first mount.
  useEffect(() => {
    void startSession();
    return () => {
      // Tear down audio on unmount if still active.
      if (audioSessionActive.current) {
        void stopAudioSession();
        audioSessionActive.current = false;
      }
    };
  }, [startSession]);

  // ---------------------------------------------------------------------------
  // End call handler
  // ---------------------------------------------------------------------------

  function handleEnd(): void {
    setScreenState({ phase: 'ended' });
    if (audioSessionActive.current) {
      void stopAudioSession();
      audioSessionActive.current = false;
    }
    // Navigate to matches after conversation ends.
    router.replace('/matches');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isConnectingOrLive = screenState.phase === 'connecting' || screenState.phase === 'live';

  return (
    <View style={styles.root}>
      {/* Compliance banner — always at top, never hidden (EU AI Act Art. 50) */}
      <AiDisclosureBanner />

      <View style={styles.content}>
        {/* Pre-session: spoken disclosure text */}
        {(screenState.phase === 'idle' || screenState.phase === 'requesting_permission') && (
          <>
            <Text style={styles.heading}>Meet your AI companion</Text>
            <Text style={styles.subtext}>
              Your AI companion will ask you a few questions to understand what you're looking for.
              The more you share, the better your matches will be.
            </Text>
            <View style={styles.disclosureBox}>
              <Text style={styles.disclosureText}>"{AI_DISCLOSURE.spoken}"</Text>
            </View>
            {screenState.phase === 'requesting_permission' && (
              <ActivityIndicator size="large" color="#7C3AED" style={styles.loader} />
            )}
          </>
        )}

        {/* Error state */}
        {screenState.phase === 'error' && (
          <>
            <Text style={styles.heading}>Connection problem</Text>
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{screenState.message}</Text>
            </View>
            {screenState.retryable && (
              <Pressable style={styles.primaryButton} onPress={() => void startSession()}>
                <Text style={styles.primaryButtonText}>Try again</Text>
              </Pressable>
            )}
          </>
        )}

        {/* LiveKit room — rendered once we have a URL + token */}
        {isConnectingOrLive && (
          <LiveKitRoom
            serverUrl={
              screenState.phase === 'connecting' || screenState.phase === 'live'
                ? screenState.livekitUrl
                : undefined
            }
            token={
              screenState.phase === 'connecting' || screenState.phase === 'live'
                ? screenState.token
                : undefined
            }
            connect
            audio
            onConnected={() => {
              if (screenState.phase === 'connecting') {
                setScreenState((prev) =>
                  prev.phase === 'connecting'
                    ? { phase: 'live', livekitUrl: prev.livekitUrl, token: prev.token }
                    : prev,
                );
              }
            }}
            onDisconnected={handleEnd}
            onError={(_err) => {
              setScreenState({
                phase: 'error',
                message: 'The voice connection was interrupted. Please try again.',
                retryable: true,
              });
            }}
          >
            <CallControls onEnd={handleEnd} />
          </LiveKitRoom>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 20,
    justifyContent: 'center',
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
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
  loader: {
    marginTop: 24,
    alignSelf: 'center',
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
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // --- Call controls (inside LiveKitRoom) ---
  callControls: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    marginRight: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#9CA3AF',
  },
  statusDotLive: {
    backgroundColor: '#16A34A',
  },
  statusDotReconnecting: {
    backgroundColor: '#D97706',
  },
  statusText: {
    fontSize: 15,
    color: '#374151',
  },
  // Talking/listening indicator ring
  ring: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E5E7EB',
  },
  ringAgentSpeaking: {
    borderColor: '#7C3AED',
    backgroundColor: '#EDE9FE',
  },
  ringUserSpeaking: {
    borderColor: '#16A34A',
    backgroundColor: '#DCFCE7',
  },
  ringIcon: {
    fontSize: 48,
  },
  micButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  micButtonActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#7C3AED',
  },
  micLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
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
