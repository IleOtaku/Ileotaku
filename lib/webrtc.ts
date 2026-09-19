/**
 * PART 5 — Voice calls. WebRTC peer connection setup using Firestore as the signaling
 * server (offer/answer/ICE candidates all relayed through documents under `calls/{callId}`,
 * since this project has no separate signaling server — Firestore's own real-time listeners are
 * what the rest of this app already leans on for everything else "live"). Voice-only (audio
 * track only, no video) and 1:1 only, matching the spec this was built against.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { addSystemMessage } from "./dms";
import { logError } from "./errorLogger";
import { createNotification } from "./notifications";
import { NotificationType } from "@/types";

// Beta feedback bug: "we can't hear each other on calls." STUN-only ICE only connects two peers
// directly when at least one side's NAT allows hole-punching — it fails outright on symmetric NAT
// (common on mobile carriers and some corporate networks). Signaling still completes (the call
// visibly "connects") but no media flows, because there's no relay path. A TURN server relays media
// when no direct path exists.
//
// The Open Relay Project's public demo TURN (the previous config) is rate-limited and unreliable, so
// this now uses a Metered.ca account's TURN servers, credentialed through
// NEXT_PUBLIC_TURN_USERNAME / NEXT_PUBLIC_TURN_CREDENTIAL (must be set in .env.local AND in
// Vercel's env vars — NEXT_PUBLIC_ values are inlined at build time, so a redeploy is needed after
// adding them). If they're not set, this falls back to the Open Relay demo server rather than
// shipping a TURN config with undefined credentials (which the browser rejects outright).
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME;
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

const TURN_SERVERS: RTCIceServer[] =
  TURN_USERNAME && TURN_CREDENTIAL
    ? [
        "turn:a.relay.metered.ca:80",
        "turn:a.relay.metered.ca:80?transport=tcp",
        "turn:a.relay.metered.ca:443",
        "turn:a.relay.metered.ca:443?transport=tcp",
      ].map((urls) => ({ urls, username: TURN_USERNAME, credential: TURN_CREDENTIAL }))
    : [
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
      ];

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ...TURN_SERVERS,
  ],
  iceCandidatePoolSize: 10,
};

export type CallStatus = "ringing" | "active" | "ended" | "declined";

export interface CallDoc {
  callId: string;
  callerUid: string;
  calleeUid: string;
  status: CallStatus;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  startedAt: string;
  /** When the callee picked up — `duration` is measured from here, not from when it started ringing. */
  answeredAt?: string;
  endedAt?: string;
  /** Seconds. */
  duration?: number;
}

/** A fresh random call id — the caller mints this before writing anything, so both the
 * `calls/{callId}` doc's own id and the id handed to the callee (via the FCM push /
 * IncomingCallListener's live query) are the same value from the very first write. */
export function newCallId(): string {
  return crypto.randomUUID();
}

/** Beta feedback bug: "we can't hear each other on calls" — checked before EVER showing the
 * ringing/calling UI, so a call that can't possibly get a mic doesn't sit there pretending to
 * connect. `navigator.permissions` isn't implemented for the "microphone" name in every browser
 * (notably Safari), so a query failure is treated the same as "prompt" — getUserMedia's own
 * native prompt is the fallback either way. Returns "denied" only when the browser is CERTAIN the
 * permission was already refused; the call UI uses that to show a clear settings-page message
 * instead of letting getUserMedia fail with a more cryptic error partway into call setup. */
export async function checkMicrophonePermission(): Promise<"granted" | "denied" | "prompt"> {
  try {
    if (!navigator.permissions?.query) return "prompt";
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    return "prompt";
  }
}

export class WebRTCCall {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private callDocRef: DocumentReference;
  private callId: string;
  private unsubCandidates: Unsubscribe | null = null;
  private unsubCallDoc: Unsubscribe | null = null;
  private remoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private callEndedCallback: (() => void) | null = null;
  private statusCallback: ((status: CallStatus) => void) | null = null;
  private micReadyCallback: (() => void) | null = null;
  /** True once getUserMedia has resolved and the mic track is on the peer connection. */
  micReady = false;
  // ICE candidates from the other side that arrived before this side's remote description was
  // set. addIceCandidate() throws InvalidStateError in that state, and the old code swallowed the
  // error — silently dropping candidates (on the caller, the callee's candidates routinely land
  // before the answer has been applied), which can leave ICE with no usable path and no audio.
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private answerApplied = false;
  /** Set on the CALLER's instance only: where to post the inline "missed / declined / voice call ·
   * 3:24" activity line, and who's calling (for the missed-call wording). */
  private chat: { conversationId: string; callerName: string } | null = null;
  private summaryPosted = false;

  constructor(callId: string) {
    this.callId = callId;
    this.pc = new RTCPeerConnection(ICE_CONFIG);
    this.callDocRef = doc(db, "calls", callId);

    // Beta feedback bug: "we can't hear each other on calls" — these three logs are the standard
    // WebRTC diagnostic triad for exactly this symptom (call "connects" but no media flows).
    // `iceConnectionState` is the one that matters most: "connected"/"completed" means a media
    // path was actually found (direct or via TURN relay); "failed" means ICE negotiation never
    // found ANY usable path — the case a STUN-only config hits on symmetric NAT. Left in
    // permanently (not stripped after debugging) since they're only ever printed while a call is
    // actually in progress, and they're the fastest way to tell "still misconfigured" apart from
    // "found a path, so the bug is somewhere else" the next time this is reported.
    this.pc.oniceconnectionstatechange = () => {
      console.log("[webrtc] ICE connection state:", this.pc.iceConnectionState, "callId:", this.callId);
    };
    this.pc.onconnectionstatechange = () => {
      console.log("[webrtc] connection state:", this.pc.connectionState, "callId:", this.callId);
    };
    this.pc.onsignalingstatechange = () => {
      console.log("[webrtc] signaling state:", this.pc.signalingState, "callId:", this.callId);
    };
  }

  private async openMic(): Promise<MediaStream> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch (error) {
      console.error("[webrtc] getUserMedia failed:", error);
      throw error;
    }
    this.localStream = stream;
    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));
    this.micReady = true;
    this.micReadyCallback?.();
    return stream;
  }

  private async addRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn("[webrtc] addIceCandidate failed:", error);
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) await this.addRemoteCandidate(candidate);
  }

  private wireRemoteStream() {
    const remoteStream = new MediaStream();
    this.pc.ontrack = (event) => {
      console.log("[webrtc] remote track received:", event.track.kind);
      event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
      this.remoteStreamCallback?.(remoteStream);
    };
  }

  /** Beta feedback: "Add inline activity messages in DMs (angie missed a call...)". Only the caller's
   * instance posts, and only once, so the thread gets exactly one line per call however it ends. */
  setChatContext(conversationId: string, callerName: string): void {
    this.chat = { conversationId, callerName };
  }

  private async postSummary(outcome: "missed" | "declined" | "completed", durationSeconds = 0): Promise<void> {
    if (!this.chat || this.summaryPosted) return;
    this.summaryPosted = true;
    const m = Math.floor(durationSeconds / 60);
    const s = String(durationSeconds % 60).padStart(2, "0");
    const text =
      outcome === "missed"
        ? `📞 Missed voice call from ${this.chat.callerName}`
        : outcome === "declined"
          ? "📞 Voice call declined"
          : `📞 Voice call · ${m}:${s}`;
    await addSystemMessage(this.chat.conversationId, text);
  }

  /** Caller's side: mints the offer, writes the call doc (status "ringing"), and starts
   * listening for the callee's answer + ICE candidates. Returns the call id (same one passed
   * to the constructor — returned for API-shape convenience, matching callers that construct
   * WebRTCCall and immediately call startCall in one expression). */
  async startCall(localUid: string, remoteUid: string): Promise<string> {
    try {
      await this.openMic();
      this.wireRemoteStream();

      const callerCandidates = collection(this.callDocRef, "callerCandidates");
      this.pc.onicecandidate = (event) => {
        if (event.candidate) addDoc(callerCandidates, event.candidate.toJSON()).catch(() => {});
      };

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      await setDoc(this.callDocRef, {
        callId: this.callId,
        callerUid: localUid,
        calleeUid: remoteUid,
        status: "ringing",
        offer: { type: offer.type, sdp: offer.sdp },
        startedAt: new Date().toISOString(),
      } satisfies CallDoc);

      createNotification(
        remoteUid,
        NotificationType.INCOMING_CALL,
        `📞 ${this.chat?.callerName ?? "Someone"} is calling you`,
        "Open ÍléOtaku to answer.",
        "/messages"
      ).catch(() => {});

      this.unsubCallDoc = onSnapshot(this.callDocRef, async (snap) => {
        const data = snap.data() as CallDoc | undefined;
        if (!data) return;
        this.statusCallback?.(data.status);
        if (data.status === "active" && data.answer && !this.answerApplied) {
          this.answerApplied = true;
          try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await this.flushPendingCandidates();
          } catch (error) {
            console.error("[webrtc] setRemoteDescription(answer) failed:", error);
          }
        }
        if (data.status === "declined") this.postSummary("declined").catch(() => {});
        if (data.status === "ended") {
          if (data.answeredAt) this.postSummary("completed", data.duration ?? 0).catch(() => {});
          else this.postSummary("missed").catch(() => {});
        }
        if (data.status === "declined" || data.status === "ended") this.callEndedCallback?.();
      });

      const calleeCandidates = collection(this.callDocRef, "calleeCandidates");
      this.unsubCandidates = onSnapshot(calleeCandidates, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") void this.addRemoteCandidate(change.doc.data() as RTCIceCandidateInit);
        });
      });

      return this.callId;
    } catch (error) {
      await logError(error, { operation: "webrtc.startCall", localUid, remoteUid });
      throw error;
    }
  }

  /** Callee's side: reads the existing offer, mints the answer, flips the call to "active", and
   * starts listening for the caller's ICE candidates. */
  async answerCall(callId: string): Promise<void> {
    try {
      const snap = await getDoc(this.callDocRef);
      const data = snap.data() as CallDoc | undefined;
      if (!data?.offer) throw new Error("This call is no longer available.");

      await this.openMic();
      this.wireRemoteStream();

      const calleeCandidates = collection(this.callDocRef, "calleeCandidates");
      this.pc.onicecandidate = (event) => {
        if (event.candidate) addDoc(calleeCandidates, event.candidate.toJSON()).catch(() => {});
      };

      await this.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      await this.flushPendingCandidates();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      await updateDoc(this.callDocRef, {
        status: "active",
        answeredAt: new Date().toISOString(),
        answer: { type: answer.type, sdp: answer.sdp },
      });

      const callerCandidates = collection(this.callDocRef, "callerCandidates");
      this.unsubCandidates = onSnapshot(callerCandidates, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") void this.addRemoteCandidate(change.doc.data() as RTCIceCandidateInit);
        });
      });

      this.unsubCallDoc = onSnapshot(this.callDocRef, (docSnap) => {
        const d = docSnap.data() as CallDoc | undefined;
        if (!d) return;
        this.statusCallback?.(d.status);
        if (d.status === "ended") this.callEndedCallback?.();
      });
    } catch (error) {
      await logError(error, { operation: "webrtc.answerCall", callId });
      throw error;
    }
  }

  /** Declines a ringing call — the callee's own "hang up before answering" path, distinct from
   * endCall (which stamps a real duration, meaningless for a call that never connected). */
  async declineCall(): Promise<void> {
    await updateDoc(this.callDocRef, { status: "declined", endedAt: new Date().toISOString() }).catch(() => {});
    this.cleanup();
  }

  async endCall(): Promise<void> {
    try {
      const snap = await getDoc(this.callDocRef);
      const data = snap.data() as CallDoc | undefined;
      // Measured from when the callee answered, not from when it started ringing.
      const startedAtMs = data?.answeredAt ? new Date(data.answeredAt).getTime() : data?.startedAt ? new Date(data.startedAt).getTime() : Date.now();
      const duration = Math.max(0, Math.round((Date.now() - startedAtMs) / 1000));
      await updateDoc(this.callDocRef, {
        status: "ended",
        endedAt: new Date().toISOString(),
        duration,
      }).catch(() => {});
      if (data?.answeredAt) this.postSummary("completed", duration).catch(() => {});
      else this.postSummary("missed").catch(() => {});
    } finally {
      this.cleanup();
    }
  }

  /** Best-effort — a stale call's signaling subcollections (candidates) are small and harmless
   * to leave behind, but tidying them up on a clean end keeps the collection from growing
   * unbounded over the app's lifetime. Never blocks endCall/declineCall on this succeeding. */
  async cleanupSignalingDocs(): Promise<void> {
    try {
      const [callerCandidates, calleeCandidates] = await Promise.all([
        getDocs(collection(this.callDocRef, "callerCandidates")),
        getDocs(collection(this.callDocRef, "calleeCandidates")),
      ]);
      await Promise.all([
        ...callerCandidates.docs.map((d) => deleteDoc(d.ref)),
        ...calleeCandidates.docs.map((d) => deleteDoc(d.ref)),
      ]);
    } catch {
      // Non-fatal — see doc comment above.
    }
  }

  /** Tears down a call that was never answered/started (e.g. the caller hung up while it was still
   * ringing): closes the peer connection and any listeners so nothing is left dangling. */
  dispose(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.pc.getSenders().forEach((sender) => sender.track?.stop());
    this.pc.close();
    this.unsubCandidates?.();
    this.unsubCallDoc?.();
  }

  /** Toggles the local mic track and returns the new muted state (true = now muted). */
  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled;
  }

  onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.remoteStreamCallback = callback;
  }

  /** Fires once the mic is open (immediately if it already is) — drives the "Requesting
   * microphone..." status on the caller's outgoing screen. */
  onMicReady(callback: () => void): void {
    this.micReadyCallback = callback;
    if (this.micReady) callback();
  }

  onCallEnded(callback: () => void): void {
    this.callEndedCallback = callback;
  }

  onStatusChange(callback: (status: CallStatus) => void): void {
    this.statusCallback = callback;
  }
}
