// LiveKit integration helpers — platform-agnostic TypeScript barrel.
//
// Metro / Expo Router use platform-suffix resolution at BUNDLE time:
//   .native.ts  → iOS + Android  (imports @livekit/react-native)
//   .web.ts     → browser build  (no native imports)
//
// At runtime Metro ALWAYS prefers livekit.native.ts / livekit.web.ts over
// this file, so the implementations here are never actually executed.
// However `tsc --noEmit` does NOT perform Metro's platform suffix resolution,
// so it type-checks this file directly. We therefore provide a safe web-style
// no-op implementation here so `tsc` sees well-typed symbols without pulling
// in the native @livekit/react-native package.
//
// IMPORTANT: Do NOT import @livekit/react-native or @livekit/react-native-webrtc
// here — this file must be importable in any context, including type-check
// and non-native test environments.

/**
 * No-op implementation used only for TypeScript resolution.
 * Metro replaces this at bundle time with the platform-specific variant.
 */
export function setupLiveKit(): void {
  // Replaced at bundle time by livekit.native.ts or livekit.web.ts
}

/**
 * No-op implementation used only for TypeScript resolution.
 * Metro replaces this at bundle time with the platform-specific variant.
 */
export async function startAudioSession(): Promise<void> {
  // Replaced at bundle time by livekit.native.ts or livekit.web.ts
}

/**
 * No-op implementation used only for TypeScript resolution.
 * Metro replaces this at bundle time with the platform-specific variant.
 */
export async function stopAudioSession(): Promise<void> {
  // Replaced at bundle time by livekit.native.ts or livekit.web.ts
}
