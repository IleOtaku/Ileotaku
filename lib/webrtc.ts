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
import { logError } from "./errorLogger";
import { createNotification } from "./notifications";
import { NotificationType } from "@/types";

// Beta feedback bug: "we can't hear each other on calls." STUN-only ICE (the two entries below)
// only lets two peers connect directly when at least one side is behind a NAT type that allows
// hole-punching — it fails outright for symmetric NAT, common on cellular/mobile-carrier and
// some corporate networks. In that case signaling still completes (the call visibly "connects")
// but no media ever flows, because there's no relay path once direct P2P fails. A TURN server is
// the standard fix — it relays media when a direct path can't be found. This project doesn't have
// its own TURN credentials (that needs a paid/free-tier account with a provider like Twilio,
// Xirsys, or a self-hosted coturn instance), so this falls back to Open Relay Project's public,
// no-signup-required demo TURN server (openrelay.metered.ca) — rate-limited and not meant for
// heavy production load, but it's a real fix for calls that currently fail silently, and needs no
// new credentials to add. Swap in a dedicated TURN provider's credentials here if usage grows.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

export type CallStatus = "ringing" | "active" | "ended" | "declined";

export interface CallDoc {
  callId: string;
  callerUid: string;
  calleeUid: string;
  status: CallStatus;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  startedAt: string;
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

  constructor(callId: string) {
    this.callId = callId;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.callDocRef = doc(db, "calls", callId);
  }

  private async openMic(): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.localStream.getTracks().forEach((track) => this.pc.addTrack(track, this.localStream!));
    return this.localStream;
  }

  private wireRemoteStream() {
    const remoteStream = new MediaStream();
    this.pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
      this.remoteStreamCallback?.(remoteStream);
    };
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
        NotificationType.GROUP_ADDED, // no dedicated "incoming call" push category exists yet — see final report
        "Incoming voice call",
        "Someone is calling you on ÍléOtaku.",
        "/messages"
      ).catch(() => {});

      this.unsubCallDoc = onSnapshot(this.callDocRef, async (snap) => {
        const data = snap.data() as CallDoc | undefined;
        if (!data) return;
        this.statusCallback?.(data.status);
        if (data.status === "active" && data.answer && !this.pc.currentRemoteDescription) {
          await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        if (data.status === "declined" || data.status === "ended") this.callEndedCallback?.();
      });

      const calleeCandidates = collection(this.callDocRef, "calleeCandidates");
      this.unsubCandidates = onSnapshot(calleeCandidates, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") this.pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
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
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      await updateDoc(this.callDocRef, {
        status: "active",
        answer: { type: answer.type, sdp: answer.sdp },
      });

      const callerCandidates = collection(this.callDocRef, "callerCandidates");
      this.unsubCandidates = onSnapshot(callerCandidates, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") this.pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
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
      const startedAtMs = data?.startedAt ? new Date(data.startedAt).getTime() : Date.now();
      await updateDoc(this.callDocRef, {
        status: "ended",
        endedAt: new Date().toISOString(),
        duration: Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)),
      }).catch(() => {});
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

  onCallEnded(callback: () => void): void {
    this.callEndedCallback = callback;
  }

  onStatusChange(callback: (status: CallStatus) => void): void {
    this.statusCallback = callback;
  }
}
