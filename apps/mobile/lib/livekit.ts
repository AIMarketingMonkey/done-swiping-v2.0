// LiveKit integration stub.
//
// TODO(M2): Wire up real room connection:
//   - Call startSession() from lib/api.ts to get {livekit_url, token, room}
//   - Connect to the room via Room.connect(livekit_url, token)
//   - Subscribe to audio tracks (the AI voice agent speaks on the agent track)
//   - Publish the user's microphone track
//   - Handle disconnect / error states
//   - Expose room state for the voice screen UI
//
// NATIVE BUILD REQUIRED:
//   @livekit/react-native depends on @livekit/react-native-webrtc which
//   contains native iOS/Android code. It will NOT run in Expo Go.
//   You must run `expo prebuild` and build a development client or production
//   binary. See README.md for the full prebuild instructions.

import { registerGlobals } from '@livekit/react-native';

export interface LiveKitConnectionParams {
  livekit_url: string;
  token: string;
  room: string;
}

/**
 * Call once at app startup (e.g. in the root layout) to register the WebRTC
 * globals required by @livekit/react-native.
 *
 * Must be called before any Room is created.
 */
export function setupLiveKit(): void {
  registerGlobals();
}

/**
 * Join a LiveKit room with the given connection params.
 *
 * TODO(M2): Replace this stub with real Room.connect() logic.
 * The params come from POST /session/start (see lib/api.ts → startSession()).
 */
export async function joinRoom(_params: LiveKitConnectionParams): Promise<void> {
  // TODO(M2): Implement real room connection.
  // Example:
  //   const room = new Room();
  //   await room.connect(params.livekit_url, params.token);
  //   await room.localParticipant.setMicrophoneEnabled(true);
  //   return room;
  throw new Error('joinRoom is not yet implemented. See TODO(M2).');
}
