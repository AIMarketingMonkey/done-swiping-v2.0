// LiveKit integration helpers — WEB implementation.
//
// Browsers have native WebRTC. Audio session management is handled by the
// browser itself, so the native audio session APIs are no-ops here.
//
// Metro / Expo Router resolve this file for the web target because of the
// `.web.ts` suffix. Native targets resolve `livekit.native.ts` instead.
//
// NOTE: This file intentionally imports nothing from @livekit/react-native or
// @livekit/react-native-webrtc. Those packages contain native code and must
// never be referenced in the web bundle.

/**
 * No-op on web — browsers manage WebRTC and audio session automatically.
 */
export function setupLiveKit(): void {
  // No-op for web: native WebRTC globals are already available in the browser.
}

/**
 * No-op on web — browser handles audio routing natively.
 */
export async function startAudioSession(): Promise<void> {
  // No native audio session to manage in the browser.
}

/**
 * No-op on web — browser handles audio routing natively.
 */
export async function stopAudioSession(): Promise<void> {
  // No native audio session to tear down in the browser.
}
