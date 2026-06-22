// Stub for @livekit/react-native and @livekit/react-native-webrtc on web.
//
// These packages contain native iOS/Android code and must never be executed
// in the browser. Metro's resolveRequest in metro.config.js redirects any
// import of those packages to this stub on the 'web' platform so the bundle
// can complete without native initialisation errors.
//
// The real native implementations are used on iOS/Android builds via
// lib/livekit.native.ts which imports @livekit/react-native directly.

module.exports = {
  // @livekit/react-native exports
  registerGlobals: () => {},
  AudioSession: {
    startAudioSession: async () => {},
    stopAudioSession: async () => {},
    getAudioSessionMode: async () => 'default',
  },
  LiveKitRoom: () => null,
  useRoom: () => ({}),
  useParticipant: () => ({}),
  useConnectionState: () => 'disconnected',
  useLocalParticipant: () => ({}),
  useVoiceAssistant: () => ({
    state: 'idle',
    agent: undefined,
    audioTrack: undefined,
    videoTrack: undefined,
    agentTranscriptions: [],
    agentAttributes: undefined,
  }),

  // @livekit/react-native-webrtc exports (all no-ops on web)
  RTCPeerConnection: class {},
  RTCSessionDescription: class {},
  RTCIceCandidate: class {},
  mediaDevices: {},
  MediaStream: class {},
  MediaStreamTrack: class {},
};
