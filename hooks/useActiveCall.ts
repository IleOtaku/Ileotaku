import { create } from "zustand";
import type { CallStatus, WebRTCCall } from "@/lib/webrtc";

export type CallDirection = "outgoing" | "incoming";

export interface ActiveCallPeer {
  uid: string;
  displayName: string;
  photoURL?: string;
}

interface ActiveCallState {
  callId: string | null;
  call: WebRTCCall | null;
  peer: ActiveCallPeer | null;
  direction: CallDirection | null;
  status: CallStatus | null;
  minimized: boolean;
  remoteStream: MediaStream | null;
  muted: boolean;
  start: (callId: string, call: WebRTCCall, peer: ActiveCallPeer, direction: CallDirection, status: CallStatus) => void;
  setStatus: (status: CallStatus) => void;
  setRemoteStream: (stream: MediaStream) => void;
  setMuted: (muted: boolean) => void;
  minimize: () => void;
  restore: () => void;
  reset: () => void;
}

/**
 * PART 5 — Voice calls. Global call state, held outside any one component's tree (same reasoning
 * as useAuth) so IncomingCallListener (mounted once, app-wide, to catch a ringing call regardless
 * of which page the callee is on) and CallUI (which renders the actual overlay/pip) and whichever
 * DM thread started an outgoing call can all read/drive the same single active call.
 */
export const useActiveCall = create<ActiveCallState>((set) => ({
  callId: null,
  call: null,
  peer: null,
  direction: null,
  status: null,
  minimized: false,
  remoteStream: null,
  muted: false,
  start: (callId, call, peer, direction, status) =>
    set({ callId, call, peer, direction, status, minimized: false, remoteStream: null, muted: false }),
  setStatus: (status) => set({ status }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setMuted: (muted) => set({ muted }),
  minimize: () => set({ minimized: true }),
  restore: () => set({ minimized: false }),
  reset: () => set({ callId: null, call: null, peer: null, direction: null, status: null, minimized: false, remoteStream: null, muted: false }),
}));
