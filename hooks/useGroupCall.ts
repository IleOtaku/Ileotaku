import { create } from "zustand";
import toast from "react-hot-toast";
import {
  GROUP_CALL_HEARTBEAT_MS,
  GROUP_CALL_RING_MS,
  declineGroupCall,
  formatCallDuration,
  heartbeatGroupCall,
  joinGroupCall,
  joinedCount,
  leaveGroupCall,
  setGroupCallMuted,
  startGroupCall,
  subscribeToGroupCall,
  type CallUser,
} from "@/lib/groupCalls";
import { GroupCallManager, type PeerState } from "@/lib/groupWebRTC";
import { checkMicrophonePermission } from "@/lib/webrtc";
import { useActiveCall } from "@/hooks/useActiveCall";
import type { Conversation, GroupCall } from "@/types";

/**
 * Group voice calls — the one live call this browser tab is in. Held in a global store (same
 * reasoning as useActiveCall) because the call has to outlive whatever page started it: you can
 * accept an incoming call from the feed and navigate to the chat with the call still running, and
 * the full-screen UI (GroupCallHost, mounted once in app/layout.tsx) just reads from here.
 *
 * The store owns the whole lifecycle: mic → Firestore start/join → signaling → heartbeat → ring
 * timeout → local teardown. Only one group call at a time, and never alongside a 1:1 call.
 */
interface GroupCallState {
  phase: "idle" | "connecting" | "in-call";
  callId: string | null;
  call: GroupCall | null;
  peerStates: Record<string, PeerState>;
  /** uid → speaking, computed locally from each peer's audio (never written to Firestore). */
  speaking: Record<string, boolean>;
  muted: boolean;
  speakerOn: boolean;
  /** Incoming calls the user has turned away or let ring out on this device (this session only). */
  dismissedRings: string[];

  start: (conversation: Conversation, user: CallUser, memberUids?: string[]) => Promise<void>;
  join: (callId: string, user: CallUser) => Promise<void>;
  leave: () => Promise<void>;
  decline: (call: GroupCall, user: CallUser) => Promise<void>;
  dismissRing: (callId: string) => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
}

let manager: GroupCallManager | null = null;
let unsubCall: (() => void) | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let localUser: CallUser | null = null;
let pageHideHandler: (() => void) | null = null;

/** Stops everything on THIS device (mic, peer connections, timers, listeners). Doesn't touch
 * Firestore — leaving/ending the call there is the caller's job. */
async function teardownLocal(): Promise<void> {
  unsubCall?.();
  unsubCall = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
  if (pageHideHandler) window.removeEventListener("pagehide", pageHideHandler);
  pageHideHandler = null;
  const m = manager;
  manager = null;
  await m?.destroy();
  useGroupCall.setState({
    phase: "idle",
    callId: null,
    call: null,
    peerStates: {},
    speaking: {},
    muted: false,
    speakerOn: true,
  });
}

/** Mic → (create or join the call in Firestore) → signaling → live subscription. Anything that
 * goes wrong along the way unwinds everything already done, so a failed attempt never leaves the
 * mic on, a half-joined call, or a stuck "connecting" screen behind. */
async function openSession(user: CallUser, enter: () => Promise<{ callId: string; initiator: boolean }>): Promise<void> {
  const store = useGroupCall.getState();
  if (store.phase !== "idle") throw new Error("You're already on a group call.");
  if (useActiveCall.getState().callId) throw new Error("Finish your current call before starting another.");
  if ((await checkMicrophonePermission()) === "denied") {
    throw new Error("Please enable microphone access in your browser settings to join calls.");
  }

  localUser = user;
  useGroupCall.setState({ phase: "connecting", muted: false, speakerOn: true, peerStates: {}, speaking: {} });
  const m = new GroupCallManager(user.uid, {
    onPeerStates: (peerStates) => useGroupCall.setState({ peerStates }),
    onSpeaking: (speaking) => useGroupCall.setState({ speaking }),
  });
  manager = m;

  let enteredCallId: string | null = null;
  try {
    await m.initLocalStream();
    const { callId, initiator } = await enter();
    enteredCallId = callId;
    await m.attach(callId);
    if (manager !== m) throw new Error("Call was cancelled.");

    useGroupCall.setState({ callId, phase: "in-call" });
    unsubCall = subscribeToGroupCall(callId, (call) => onCallSnapshot(callId, call));
    heartbeat = setInterval(() => heartbeatGroupCall(callId).catch(() => {}), GROUP_CALL_HEARTBEAT_MS);
    // Best effort only: a closing tab can't wait for a transaction. If it doesn't land, the missing
    // heartbeat is what eventually marks the call as dead for everyone else.
    pageHideHandler = () => {
      leaveGroupCall(callId, user.uid).catch(() => {});
    };
    window.addEventListener("pagehide", pageHideHandler);

    if (initiator) {
      // Nobody picked up: give up instead of ringing forever. leaveGroupCall ends the call
      // (nobody else joined) and posts "Missed group call from …" + the missed notifications.
      ringTimer = setTimeout(() => {
        const call = useGroupCall.getState().call;
        if (call && joinedCount(call) <= 1) {
          toast("No answer.");
          useGroupCall.getState().leave().catch(() => {});
        }
      }, GROUP_CALL_RING_MS);
    }
  } catch (error) {
    await teardownLocal();
    if (enteredCallId) await leaveGroupCall(enteredCallId, user.uid).catch(() => {});
    throw error;
  }
}

function onCallSnapshot(callId: string, call: GroupCall | null): void {
  if (useGroupCall.getState().callId !== callId || !manager) return;
  const me = localUser?.uid;
  if (!call || call.status === "ended" || (me && call.participants[me]?.status !== "joined")) {
    if (call?.status === "ended") {
      toast(
        call.activeAt
          ? `Group call ended · ${formatCallDuration(call.duration ?? 0)}`
          : call.participants[call.initiatorUid] && me === call.initiatorUid
            ? "Nobody joined the call."
            : "The call ended."
      );
    }
    teardownLocal().catch(() => {});
    return;
  }
  useGroupCall.setState({ call });
  if (ringTimer && joinedCount(call) > 1) {
    clearTimeout(ringTimer);
    ringTimer = null;
  }
  manager.syncParticipants(
    Object.values(call.participants)
      .filter((p) => p.status === "joined")
      .map((p) => p.uid)
  );
}

export const useGroupCall = create<GroupCallState>((set, get) => ({
  phase: "idle",
  callId: null,
  call: null,
  peerStates: {},
  speaking: {},
  muted: false,
  speakerOn: true,
  dismissedRings: [],

  start: (conversation, user, memberUids) =>
    openSession(user, async () => ({
      callId: await startGroupCall(conversation, user, memberUids),
      initiator: true,
    })),

  join: (callId, user) =>
    openSession(user, async () => {
      await joinGroupCall(callId, user);
      return { callId, initiator: false };
    }),

  leave: async () => {
    const { callId } = get();
    const uid = localUser?.uid;
    // Silence the mic and drop the peer connections first, so hanging up feels instant.
    await teardownLocal();
    if (callId && uid) await leaveGroupCall(callId, uid).catch((e) => console.error("[groupCall] leave failed:", e));
  },

  decline: async (call, user) => {
    set((s) => ({ dismissedRings: [...s.dismissedRings, call.callId] }));
    await declineGroupCall(call.callId, user).catch((e) => console.error("[groupCall] decline failed:", e));
  },

  dismissRing: (callId) => set((s) => (s.dismissedRings.includes(callId) ? s : { dismissedRings: [...s.dismissedRings, callId] })),

  toggleMute: () => {
    const { muted, callId } = get();
    const next = !muted;
    manager?.setMuted(next);
    set({ muted: next });
    if (callId && localUser) setGroupCallMuted(callId, localUser.uid, next).catch(() => {});
  },

  toggleSpeaker: () => {
    const next = !get().speakerOn;
    manager?.setSpeakerOn(next);
    set({ speakerOn: next });
  },
}));
