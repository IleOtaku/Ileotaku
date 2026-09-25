/**
 * Group voice calls — the audio side, on a LiveKit SFU room (replaces the old mesh WebRTC
 * implementation in lib/groupWebRTC.ts, which topped out around 6 people: a mesh needs one
 * RTCPeerConnection per OTHER participant, so it scales as n·(n-1)/2). Every participant now
 * uploads their mic ONCE, to LiveKit's server, which fans it back out — the same shape regardless
 * of whether the room has 3 people or 300.
 *
 * This class exposes the exact same public surface hooks/useGroupCall.ts already called against
 * the mesh manager (initLocalStream / attach / syncParticipants / setMuted / setSpeakerOn /
 * destroy), so that store — and everything downstream of it, including the minimize/pip UI —
 * needed no changes at all to make this swap.
 */
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { auth } from "./firebase";
import { groupCallRoomName } from "./livekitRoom";

export type PeerState = "connecting" | "connected" | "reconnecting" | "failed";

export interface GroupCallCallbacks {
  onPeerStates?: (states: Record<string, PeerState>) => void;
  /** uid → is-speaking, INCLUDING the local user. Fires only when something changed. */
  onSpeaking?: (speaking: Record<string, boolean>) => void;
}

/** Best-effort — startGroupCall() fires this once and ignores failures, since LiveKit auto-creates
 * the room with its project default the moment the first participant actually connects anyway.
 * This only exists to set GROUP_CALL_MAX as the room's real ceiling up front. */
export async function createLiveKitRoom(callId: string, maxParticipants: number): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return;
  await fetch("/api/livekit/room", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ callId, maxParticipants }),
  }).catch(() => {});
}

async function fetchToken(callId: string): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Please sign in again.");
  const res = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ callId }),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; token?: string; message?: string };
  if (!res.ok || !data.success || !data.token) throw new Error(data.message ?? "Couldn't join this call's audio.");
  return data.token;
}

export class LiveKitGroupCallManager {
  private room: Room | null = null;
  private micStream: MediaStream | null = null;
  private muted = false;
  private speakerOn = true;
  private peerStates: Record<string, PeerState> = {};
  private speaking: Record<string, boolean> = {};
  private remoteAudioEls = new Map<string, HTMLMediaElement[]>();
  private destroyed = false;

  constructor(private readonly localUid: string, private readonly callbacks: GroupCallCallbacks = {}) {}

  /** Opens the microphone just long enough to confirm permission — same up-front check the mesh
   * manager did, so a denied prompt never gets as far as creating/joining the Firestore call.
   * LiveKit gets its own mic capture in attach() (setMicrophoneEnabled), so this stream is closed
   * again immediately rather than held and republished. */
  async initLocalStream(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("Call was cancelled.");
    }
    this.micStream = stream;
    return stream;
  }

  /** Connects to this call's LiveKit room and publishes the mic. Call after the call doc exists
   * (attach() asks the server for a token scoped to this exact callId — see app/api/livekit/token,
   * which also checks the caller is actually a participant of it). */
  async attach(callId: string): Promise<void> {
    // The preflight stream from initLocalStream() was only ever needed for the permission check.
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;

    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    if (!url) throw new Error("Voice calling isn't configured yet.");
    const token = await fetchToken(callId);
    if (this.destroyed) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.room = room;

    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => this.setPeerState(p.identity, "connected"));
    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => this.dropPeer(p.identity));
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.muted = !this.speakerOn;
      const list = this.remoteAudioEls.get(p.identity) ?? [];
      list.push(el);
      this.remoteAudioEls.set(p.identity, list);
      this.setPeerState(p.identity, "connected");
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const detached = track.detach();
      detached.forEach((el) => el.remove());
      const remaining = (this.remoteAudioEls.get(p.identity) ?? []).filter((el) => !detached.includes(el));
      this.remoteAudioEls.set(p.identity, remaining);
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const loud = new Set(speakers.map((s) => s.identity));
      const next: Record<string, boolean> = {};
      loud.forEach((uid) => (next[uid] = true));
      this.speaking = next;
      this.callbacks.onSpeaking?.({ ...this.speaking });
    });
    room.on(RoomEvent.Reconnecting, () => this.markAll("reconnecting"));
    room.on(RoomEvent.Reconnected, () => this.markAll("connected"));
    room.on(RoomEvent.Disconnected, () => this.markAll("failed"));

    await room.connect(url, token);
    if (this.destroyed) {
      await room.disconnect();
      return;
    }
    await room.localParticipant.setMicrophoneEnabled(!this.muted);
    room.remoteParticipants.forEach((p) => this.setPeerState(p.identity, "connected"));
  }

  /** LiveKit's own room membership IS the participant list — Firestore's `joined` set is only used
   * to decide who gets an invite/ring, not who's actually on the SFU, so there's nothing for this
   * to reconcile. Kept only so the mesh-era call sites in hooks/useGroupCall.ts don't need to
   * change. */
  syncParticipants(_joinedUids: string[]): void {
    // Intentionally empty.
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.room?.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
  }

  /** Same "speaker" meaning as the mesh manager: silences (or restores) everyone else's audio on
   * this device, without touching what we send. */
  setSpeakerOn(on: boolean): void {
    this.speakerOn = on;
    this.remoteAudioEls.forEach((els) => els.forEach((el) => (el.muted = !on)));
  }

  private setPeerState(uid: string, state: PeerState): void {
    if (this.peerStates[uid] === state) return;
    this.peerStates = { ...this.peerStates, [uid]: state };
    this.callbacks.onPeerStates?.({ ...this.peerStates });
  }

  private dropPeer(uid: string): void {
    if (!(uid in this.peerStates)) return;
    const next = { ...this.peerStates };
    delete next[uid];
    this.peerStates = next;
    this.callbacks.onPeerStates?.({ ...this.peerStates });
    this.remoteAudioEls.get(uid)?.forEach((el) => el.remove());
    this.remoteAudioEls.delete(uid);
  }

  private markAll(state: PeerState): void {
    const next: Record<string, PeerState> = {};
    Object.keys(this.peerStates).forEach((uid) => (next[uid] = state));
    this.peerStates = next;
    this.callbacks.onPeerStates?.({ ...this.peerStates });
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.remoteAudioEls.forEach((els) => els.forEach((el) => el.remove()));
    this.remoteAudioEls.clear();
    this.peerStates = {};
    this.speaking = {};
    const room = this.room;
    this.room = null;
    if (room && room.state !== ConnectionState.Disconnected) await room.disconnect().catch(() => {});
  }
}

export { groupCallRoomName };
