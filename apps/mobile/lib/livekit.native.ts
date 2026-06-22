// LiveKit integration helpers — NATIVE (iOS + Android) implementation.
//
// NATIVE BUILD REQUIRED:
//   @livekit/react-native depends on @livekit/react-native-webrtc which
//   contains native iOS/Android code. It will NOT run in Expo Go.
//   You must run `expo prebuild` and build a development client or production
//   binary. See README.md for the full prebuild instructions.
//
// Metro / Expo Router resolve this file for native targets because of the
// `.native.ts` suffix. Web targets resolve `livekit.web.ts` instead.

import { AudioSession, registerGlobals } from '@livekit/react-native';

/**
 * Call once at app startup (e.g. in the root layout) to register the WebRTC
 * globals required by @livekit/react-native.
 *
 * Must be called before any Room is created. Internally calls
 * `registerGlobals()` from @livekit/react-native-webrtc and sets up the URL
 * polyfill and iOS audio session management.
 */
export function setupLiveKit(): void {
  registerGlobals();
}

/**
 * Start a native audio session configured for voice communication.
 *
 * Call this before connecting to a LiveKit room so audio routing is correct
 * from the moment the first track is published/subscribed.
 *
 * On iOS this activates the AVAudioSession.
 * On Android this sets communication audio mode.
 */
export async function startAudioSession(): Promise<void> {
  await AudioSession.startAudioSession();
}

/**
 * Stop the native audio session.
 *
 * Call this after the room has disconnected to release audio focus and
 * restore the previous audio routing (earpiece / media playback).
 */
export async function stopAudioSession(): Promise<void> {
  await AudioSession.stopAudioSession();
}
