// Voice onboarding screen — WEB (browser) implementation.
//
// COMPLIANCE: AiDisclosureBanner is rendered at the TOP and must remain visible
// throughout the session (EU AI Act Art. 50). Do not move it below the fold or
// allow the user to dismiss it.
//
// Architecture (web):
//   - startSession() (lib/api.ts) → POST /session/start → {livekit_url, token, room}
//   - <LiveKitRoom> from @livekit/components-react handles room connection and
//     audio publishing via native browser WebRTC (no native modules required).
//   - <RoomAudioRenderer> injects <audio> elements for remote tracks automatically.
//   - useConnectionState(), useLocalParticipant(), useVoiceAssistant() are the
//     same hooks from @livekit/components-react used on native (different import).
//
// NOTE: This file intentionally imports NOTHING from @livekit/react-native or
// @livekit/react-native-webrtc. Those packages contain native code and must
// never be referenced in the web bundle.
//
// TODO(M3): Wire live transcript — agentTranscriptions from useVoiceAssistant()
//           contains per-turn ReceivedTranscriptionSegment[] from the agent.

import { AiDisclosureBanner } from '@/components/AiDisclosureBanner';
import { AgeGateError, PremiumRequiredError } from '@/lib/api';
import * as api from '@/lib/api';
import { AI_DISCLOSURE } from '@done-swiping/shared';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useVoiceAssistant,
} from '@livekit/components-react';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Styles (plain CSS-in-JS via inline style objects — no react-native StyleSheet)
// ---------------------------------------------------------------------------

const css = {
  root: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minHeight: '100vh',
    backgroundColor: '#FFFFFF',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  content: {
    flex: 1,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: '32px 24px',
    gap: 20,
    maxWidth: 480,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: '#111827',
    margin: 0,
    textAlign: 'center' as const,
  },
  subtext: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 1.6,
    margin: 0,
    textAlign: 'center' as const,
  },
  disclosureBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    borderLeft: '4px solid #7C3AED',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  disclosureText: {
    fontSize: 14,
    color: '#374151',
    fontStyle: 'italic' as const,
    lineHeight: 1.6,
    margin: 0,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    border: '1px solid #FECACA',
    padding: 14,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 1.5,
    margin: 0,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 32,
    paddingRight: 32,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600' as const,
    border: 'none',
    cursor: 'pointer',
    width: '100%',
  },
  // --- Call controls ---
  callControls: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: 24,
    width: '100%',
  },
  statusRow: {
    display: 'flex' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: '#9CA3AF',
    display: 'inline-block' as const,
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
  spinner: {
    display: 'inline-block' as const,
    width: 16,
    height: 16,
    border: '2px solid #E5E7EB',
    borderTopColor: '#7C3AED',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  ring: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    backgroundColor: '#F3F4F6',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    border: '3px solid #E5E7EB',
    fontSize: 48,
    transition: 'border-color 0.2s, background-color 0.2s',
  },
  ringAgentSpeaking: {
    borderColor: '#7C3AED',
    backgroundColor: '#EDE9FE',
  },
  ringUserSpeaking: {
    borderColor: '#16A34A',
    backgroundColor: '#DCFCE7',
  },
  micButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: '14px 32px',
    border: '2px solid #E5E7EB',
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#111827',
    cursor: 'pointer',
    width: '100%',
  },
  micButtonActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#7C3AED',
  },
  endButton: {
    border: '1px solid #DC2626',
    borderRadius: 8,
    padding: '12px 24px',
    backgroundColor: 'transparent',
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '500' as const,
    cursor: 'pointer',
    width: '100%',
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScreenState =
  | { phase: 'idle' }
  | { phase: 'connecting'; livekitUrl: string; token: string }
  | { phase: 'live'; livekitUrl: string; token: string }
  | { phase: 'error'; message: string; retryable: boolean }
  | { phase: 'ended' };

// ---------------------------------------------------------------------------
// Inner call controls (must be rendered inside <LiveKitRoom>)
// ---------------------------------------------------------------------------

interface CallControlsProps {
  onEnd: () => void;
}

function CallControls({ onEnd }: CallControlsProps): React.JSX.Element {
  const connectionState = useConnectionState();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const { state: agentState } = useVoiceAssistant();

  // ConnectionState string values from livekit-client
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';
  const isLive = connectionState === 'connected';
  const isReconnecting = connectionState === 'reconnecting';

  async function handleToggleMic(): Promise<void> {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (_err) {
      // Silently swallow — user will notice mic state doesn't change
    }
  }

  let statusLabel = 'Connecting…';
  if (isReconnecting) statusLabel = 'Reconnecting…';
  else if (isLive) {
    if (agentState === 'speaking') statusLabel = 'AI companion is speaking';
    else if (agentState === 'thinking') statusLabel = 'Thinking…';
    else if (agentState === 'listening' || agentState === 'idle') statusLabel = 'Listening…';
    else statusLabel = 'Session active';
  }

  const agentSpeaking = isLive && agentState === 'speaking';
  const userCanSpeak = isLive && isMicrophoneEnabled;

  const dotStyle = {
    ...css.statusDot,
    ...(isLive && !isReconnecting ? css.statusDotLive : {}),
    ...(isReconnecting ? css.statusDotReconnecting : {}),
  };

  const ringStyle = {
    ...css.ring,
    ...(agentSpeaking ? css.ringAgentSpeaking : {}),
    ...(!agentSpeaking && userCanSpeak ? css.ringUserSpeaking : {}),
  };

  const micBtnStyle = {
    ...css.micButton,
    ...(isMicrophoneEnabled ? css.micButtonActive : {}),
  };

  return (
    <>
      {/* Inject audio elements for remote tracks */}
      <RoomAudioRenderer />

      <div style={css.callControls}>
        {/* Connection state indicator */}
        <div style={css.statusRow}>
          {isConnecting && <span style={css.spinner} role="status" aria-label="Connecting" />}
          <span style={dotStyle} />
          <span style={css.statusText}>{statusLabel}</span>
        </div>

        {/* Talking/listening ring */}
        <div
          style={ringStyle}
          role="img"
          aria-label={isMicrophoneEnabled ? 'Microphone active' : 'Microphone muted'}
        >
          {isMicrophoneEnabled ? '🎙️' : '🔇'}
        </div>

        {/* TODO(M3): Render live transcript here — agentTranscriptions from
             useVoiceAssistant() contains per-segment text from the agent. */}

        {/* Mute / unmute */}
        <button
          style={micBtnStyle}
          onClick={() => void handleToggleMic()}
          aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          disabled={!isLive}
        >
          {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        </button>

        {/* End call */}
        <button style={css.endButton} onClick={onEnd} aria-label="End conversation">
          End conversation
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

export default function VoiceOnboardingWeb(): React.JSX.Element {
  const router = useRouter();
  const [screenState, setScreenState] = useState<ScreenState>({ phase: 'idle' });

  // ---------------------------------------------------------------------------
  // Session start
  // ---------------------------------------------------------------------------

  const startSession = useCallback(async () => {
    setScreenState({ phase: 'idle' });

    try {
      const params = await api.startSession();
      setScreenState({
        phase: 'connecting',
        livekitUrl: params.livekit_url,
        token: params.token,
      });
    } catch (err) {
      if (err instanceof AgeGateError) {
        router.replace('/onboarding/age-gate');
        return;
      }
      if (err instanceof PremiumRequiredError) {
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
  }, [startSession]);

  // ---------------------------------------------------------------------------
  // End call handler
  // ---------------------------------------------------------------------------

  function handleEnd(): void {
    setScreenState({ phase: 'ended' });
    router.replace('/matches');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isConnectingOrLive = screenState.phase === 'connecting' || screenState.phase === 'live';

  return (
    <div style={css.root}>
      {/* Compliance banner — always at top, never hidden (EU AI Act Art. 50) */}
      <AiDisclosureBanner />

      <div style={css.content}>
        {/* Pre-session: intro text */}
        {screenState.phase === 'idle' && (
          <>
            <h1 style={css.heading}>Meet your AI companion</h1>
            <p style={css.subtext}>
              Your AI companion will ask you a few questions to understand what you&apos;re looking
              for. The more you share, the better your matches will be.
            </p>
            <div style={css.disclosureBox}>
              <p style={css.disclosureText}>&ldquo;{AI_DISCLOSURE.spoken}&rdquo;</p>
            </div>
            {/* Loading indicator while session is starting */}
            <p style={{ ...css.statusText, textAlign: 'center' }}>Starting session&hellip;</p>
          </>
        )}

        {/* Error state */}
        {screenState.phase === 'error' && (
          <>
            <h1 style={css.heading}>Connection problem</h1>
            <div style={css.errorBox}>
              <p style={css.errorText}>{screenState.message}</p>
            </div>
            {screenState.retryable && (
              <button style={css.primaryButton} onClick={() => void startSession()}>
                Try again
              </button>
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
              setScreenState((prev) =>
                prev.phase === 'connecting'
                  ? { phase: 'live', livekitUrl: prev.livekitUrl, token: prev.token }
                  : prev,
              );
            }}
            onDisconnected={handleEnd}
            onError={() => {
              setScreenState({
                phase: 'error',
                message: 'The voice connection was interrupted. Please try again.',
                retryable: true,
              });
            }}
            style={{ width: '100%' }}
          >
            <CallControls onEnd={handleEnd} />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}
