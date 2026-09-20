/**
 * Group voice calls — the audio side. A full MESH: every participant holds one RTCPeerConnection
 * to every other participant (n·(n-1)/2 connections in total, so max 6 people → 15 links, each
 * client uploading its mic 5 times). An SFU is the Phase 2 answer past that.
 *
 * Signaling goes through Firestore, like the 1:1 calls in lib/webrtc.ts: each participant OWNS one
 * document, `groupCalls/{callId}/signals/{ownUid}`, and only ever writes to it. What it says to a
 * given peer lives under that peer's uid:
 *
 *   offers[peerUid]         the offer this client made TO peerUid          { type, sdp, sid }
 *   answers[peerUid]        the answer this client gave peerUid's offer    { type, sdp, sid }
 *   iceCandidates[peerUid]  this client's ICE candidates for that link     [{ ..., sid }]
 *
 * and everyone listens to the whole `signals` collection, picking out `[myUid]` in each doc. That
 * owner-writes-only shape is what lets the security rules stay tight (nobody can write into
 * anyone else's signaling).
 *
 * Three details that matter more than they look:
 *  - Glare: if both ends of a pair offered at once neither would ever answer. The offerer for a
 *    pair is always the one with the lexicographically HIGHER uid, so there's exactly one.
 *  - `sid`: a fresh random id per connection attempt, stamped on the offer, the answer and every
 *    candidate. When a link is retried, leftovers from the previous attempt (an old answer still
 *    sitting in the other doc, candidates for a dead connection) are recognised and ignored
 *    instead of being fed to the new RTCPeerConnection.
 *  - Signaling is applied by re-reading the whole doc, not by reacting to individual changes, and
 *    candidates that arrive before their remote description are simply left unapplied until it's
 *    set — so it doesn't matter in what order Firestore delivers the offer, the answer and ICE.
 */
import { arrayUnion, collection, deleteDoc, deleteField, doc, onSnapshot, setDoc, updateDoc, type Unsubscribe } from "firebase/firestore";
import { groupCallRef } from "./groupCalls";
import { ICE_CONFIG } from "./webrtc";

export type PeerState = "connecting" | "connected" | "reconnecting" | "failed";

interface SignalDesc {
  type: RTCSdpType;
  sdp: string;
  sid: string;
}
type SignalCandidate = RTCIceCandidateInit & { sid: string };
interface SignalDoc {
  offers?: Record<string, SignalDesc>;
  answers?: Record<string, SignalDesc>;
  iceCandidates?: Record<string, SignalCandidate[]>;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  sid: string;
  isOfferer: boolean;
  state: PeerState;
  remoteDescSet: boolean;
  answerApplied: boolean;
  /** How many of the (sid-filtered) remote candidates have been handed to addIceCandidate. */
  iceApplied: number;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface GroupCallCallbacks {
  onPeerStates?: (states: Record<string, PeerState>) => void;
  /** uid → is-speaking, INCLUDING the local user. Fires only when something changed. */
  onSpeaking?: (speaking: Record<string, boolean>) => void;
}

const CONNECT_TIMEOUT_MS = 20_000;
const DISCONNECT_GRACE_MS = 6_000;
const MAX_ATTEMPTS = 4;
const ICE_FLUSH_MS = 120;
/** RMS of the time-domain signal (0–1) above which someone counts as speaking. */
const SPEAKING_THRESHOLD = 0.015;
const SPEAKING_HOLD_MS = 350;

function newSid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export class GroupCallManager {
  private peers = new Map<string, PeerEntry>();
  private localStream: MediaStream | null = null;
  private remoteAudios = new Map<string, HTMLAudioElement>();
  private unsubscribers: Unsubscribe[] = [];

  private callId: string | null = null;
  private joined = new Set<string>();
  private lastSignals = new Map<string, SignalDoc>();
  private queues = new Map<string, Promise<void>>();
  private iceOutbox = new Map<string, { sid: string; list: SignalCandidate[]; timer: ReturnType<typeof setTimeout> }>();
  private destroyed = false;
  private speakerOn = true;
  private muted = false;

  private audioCtx: AudioContext | null = null;
  private analysers = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer> }>();
  private speaking: Record<string, boolean> = {};
  private lastLoud = new Map<string, number>();
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  private resumeHandler: (() => void) | null = null;

  constructor(private readonly localUid: string, private readonly callbacks: GroupCallCallbacks = {}) {}

  /* ------------------------------ local audio ------------------------------ */

  /** Opens the microphone. Throws (NotAllowedError, NotFoundError…) if it can't — the caller must
   * do this BEFORE creating/joining the call so a call that can't have a mic never starts. */
  async initLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("Call was cancelled.");
    }
    this.localStream = stream;
    stream.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
    this.watchSpeaking(this.localUid, stream);
    return stream;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    if (muted) {
      this.lastLoud.delete(this.localUid);
      this.publishSpeaking(this.localUid, false);
    }
  }

  /** "Speaker" in a browser can't pick the earpiece vs. loudspeaker, so this is the honest
   * equivalent: it silences (or restores) everyone else's audio on this device. */
  setSpeakerOn(on: boolean): void {
    this.speakerOn = on;
    this.remoteAudios.forEach((audio) => (audio.muted = !on));
  }

  getSpeakingStates(): Record<string, boolean> {
    return { ...this.speaking };
  }

  getPeerStates(): Record<string, PeerState> {
    const out: Record<string, PeerState> = {};
    this.peers.forEach((p, uid) => (out[uid] = p.state));
    return out;
  }

  /* -------------------------------- signaling -------------------------------- */

  private signalsRef(uid: string) {
    return doc(collection(groupCallRef(this.callId as string), "signals"), uid);
  }

  /** Starts listening for other participants' signaling. Call after the call doc exists. */
  async attach(callId: string): Promise<void> {
    this.callId = callId;
    // A previous session of mine in this same call (rejoin) may have left offers/answers behind.
    await deleteDoc(this.signalsRef(this.localUid)).catch(() => {});
    this.listenForSignals();
  }

  private listenForSignals(): void {
    const unsub = onSnapshot(
      collection(groupCallRef(this.callId as string), "signals"),
      (snap) => {
        snap.docChanges().forEach((change) => {
          const uid = change.doc.id;
          if (uid === this.localUid) return;
          if (change.type === "removed") this.lastSignals.delete(uid);
          else this.lastSignals.set(uid, change.doc.data() as SignalDoc);
          this.enqueue(uid);
        });
      },
      (error) => console.error("[groupCall] signals listener failed:", error)
    );
    this.unsubscribers.push(unsub);
  }

  /** Tells the manager who is currently `joined` on the call: connects to newcomers, hangs up on
   * anyone who left. Idempotent — the caller just passes the latest list on every call snapshot. */
  syncParticipants(joinedUids: string[]): void {
    if (this.destroyed || !this.callId) return;
    const wanted = new Set(joinedUids.filter((u) => u !== this.localUid));

    wanted.forEach((uid) => {
      if (this.joined.has(uid)) return;
      this.joined.add(uid);
      if (this.localUid > uid) this.connectToPeer(uid, true).catch((e) => console.error("[groupCall] connect failed:", e));
      else this.enqueue(uid); // they'll offer; an offer may already be waiting in their doc
    });
    Array.from(this.joined).forEach((uid) => {
      if (wanted.has(uid)) return;
      this.joined.delete(uid);
      this.closePeer(uid, true);
    });
  }

  private enqueue(remoteUid: string): void {
    const prev = this.queues.get(remoteUid) ?? Promise.resolve();
    this.queues.set(
      remoteUid,
      prev.then(() => this.processSignals(remoteUid)).catch((e) => console.error("[groupCall] signaling error:", e))
    );
  }

  private async writeOwn(data: Record<string, unknown>): Promise<void> {
    if (this.destroyed || !this.callId) return;
    await setDoc(this.signalsRef(this.localUid), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  }

  /** Reads what `remoteUid` has said to me and advances my side of the link accordingly. */
  private async processSignals(remoteUid: string): Promise<void> {
    if (this.destroyed || !this.joined.has(remoteUid)) return;
    const data = this.lastSignals.get(remoteUid);
    if (!data) return;
    let entry = this.peers.get(remoteUid);

    if (this.localUid < remoteUid) {
      // They are the offerer for this pair.
      const offer = data.offers?.[this.localUid];
      if (offer && (!entry || entry.sid !== offer.sid)) {
        entry = this.createPeer(remoteUid, offer.sid, false);
        const pc = entry.pc;
        await pc.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
        entry.remoteDescSet = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (this.peers.get(remoteUid) !== entry) return; // superseded while awaiting
        await this.writeOwn({
          answers: { [remoteUid]: { type: answer.type, sdp: answer.sdp ?? "", sid: entry.sid } },
          iceCandidates: { [remoteUid]: [] },
        });
      }
    } else if (entry && entry.isOfferer && !entry.answerApplied) {
      const answer = data.answers?.[this.localUid];
      if (answer && answer.sid === entry.sid) {
        entry.answerApplied = true;
        await entry.pc.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
        entry.remoteDescSet = true;
      }
    }

    entry = this.peers.get(remoteUid);
    if (entry?.remoteDescSet) {
      const list = (data.iceCandidates?.[this.localUid] ?? []).filter((c) => c.sid === entry!.sid);
      while (entry.iceApplied < list.length) {
        const { sid: _sid, ...init } = list[entry.iceApplied++];
        try {
          await entry.pc.addIceCandidate(init);
        } catch (error) {
          console.warn(`[groupCall] addIceCandidate from ${remoteUid} failed:`, error);
        }
      }
    }
  }

  /* -------------------------------- peer links -------------------------------- */

  /** Opens (or re-opens) the link to `remoteUid`. As the offerer it creates and publishes the
   * offer; the answering side is created lazily by processSignals when that offer shows up. */
  async connectToPeer(remoteUid: string, isInitiator: boolean, attempts = 0): Promise<void> {
    if (!isInitiator) {
      this.enqueue(remoteUid);
      return;
    }
    const entry = this.createPeer(remoteUid, newSid(), true, attempts);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    if (this.peers.get(remoteUid) !== entry) return;
    await this.writeOwn({
      offers: { [remoteUid]: { type: offer.type, sdp: offer.sdp ?? "", sid: entry.sid } },
      iceCandidates: { [remoteUid]: [] },
    });
  }

  private createPeer(remoteUid: string, sid: string, isOfferer: boolean, attempts = 0): PeerEntry {
    this.closePeer(remoteUid, false);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    const entry: PeerEntry = {
      pc,
      sid,
      isOfferer,
      state: "connecting",
      remoteDescSet: false,
      answerApplied: false,
      iceApplied: 0,
      attempts,
      timer: null,
    };
    this.peers.set(remoteUid, entry);
    this.emitPeerStates();

    this.localStream?.getTracks().forEach((track) => pc.addTrack(track, this.localStream as MediaStream));

    pc.ontrack = (event) => {
      if (this.peers.get(remoteUid) !== entry) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.attachRemoteAudio(remoteUid, stream);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate && this.peers.get(remoteUid) === entry) this.queueIce(remoteUid, sid, event.candidate.toJSON());
    };
    // Same diagnostic triad as the 1:1 calls: "iceConnectionState" is what tells "signaling worked
    // but no media path" (failed) apart from a healthy link.
    pc.onicegatheringstatechange = () => console.log(`[groupCall] ${remoteUid} ICE gathering:`, pc.iceGatheringState);
    pc.oniceconnectionstatechange = () => {
      console.log(`[groupCall] ${remoteUid} ICE connection:`, pc.iceConnectionState);
      if (this.peers.get(remoteUid) !== entry) return;
      if (pc.iceConnectionState === "failed") this.reconnectToPeer(remoteUid);
    };
    pc.onconnectionstatechange = () => {
      console.log(`[groupCall] ${remoteUid} connection:`, pc.connectionState);
      if (this.peers.get(remoteUid) !== entry) return;
      switch (pc.connectionState) {
        case "connected":
          this.clearTimer(entry);
          entry.attempts = 0;
          this.setPeerState(remoteUid, entry, "connected");
          break;
        case "disconnected":
          this.setPeerState(remoteUid, entry, "reconnecting");
          this.clearTimer(entry);
          entry.timer = setTimeout(() => this.reconnectToPeer(remoteUid), DISCONNECT_GRACE_MS);
          break;
        case "failed":
          this.reconnectToPeer(remoteUid);
          break;
      }
    };

    entry.timer = setTimeout(() => this.reconnectToPeer(remoteUid), CONNECT_TIMEOUT_MS);
    return entry;
  }

  /** Called when a link failed, dropped for good, or never came up. Only the pair's offerer
   * retries (a new sid + fresh offer); the other side just waits for that new offer. */
  reconnectToPeer(remoteUid: string): void {
    const entry = this.peers.get(remoteUid);
    if (this.destroyed || !entry || !this.joined.has(remoteUid)) return;
    if (entry.state === "connected" && entry.pc.connectionState === "connected") return;
    this.clearTimer(entry);
    if (!entry.isOfferer) {
      this.setPeerState(remoteUid, entry, "reconnecting");
      // Nothing to initiate — but don't wait on a dead link forever.
      entry.timer = setTimeout(() => this.setPeerState(remoteUid, entry, "failed"), CONNECT_TIMEOUT_MS);
      return;
    }
    if (entry.attempts + 1 >= MAX_ATTEMPTS) {
      this.setPeerState(remoteUid, entry, "failed");
      return;
    }
    const attempts = entry.attempts + 1;
    console.log(`[groupCall] reconnecting to ${remoteUid} (attempt ${attempts})`);
    this.connectToPeer(remoteUid, true)
      .then(() => {
        const next = this.peers.get(remoteUid);
        if (next) {
          next.attempts = attempts;
          this.setPeerState(remoteUid, next, "reconnecting");
        }
      })
      .catch((e) => console.error("[groupCall] reconnect failed:", e));
  }

  private setPeerState(uid: string, entry: PeerEntry, state: PeerState): void {
    if (this.peers.get(uid) !== entry || entry.state === state) return;
    entry.state = state;
    this.emitPeerStates();
  }

  private emitPeerStates(): void {
    this.callbacks.onPeerStates?.(this.getPeerStates());
  }

  private clearTimer(entry: PeerEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
  }

  /* ICE candidates are batched: a single link produces ~10 of them within a fraction of a second,
   * and one Firestore write each (× up to 5 links) is wasteful. */
  private queueIce(remoteUid: string, sid: string, candidate: RTCIceCandidateInit): void {
    let box = this.iceOutbox.get(remoteUid);
    if (!box || box.sid !== sid) {
      if (box) clearTimeout(box.timer);
      box = { sid, list: [], timer: setTimeout(() => this.flushIce(remoteUid), ICE_FLUSH_MS) };
      this.iceOutbox.set(remoteUid, box);
    }
    box.list.push({ ...candidate, sid });
  }

  private flushIce(remoteUid: string): void {
    const box = this.iceOutbox.get(remoteUid);
    this.iceOutbox.delete(remoteUid);
    if (!box || box.list.length === 0) return;
    this.writeOwn({ iceCandidates: { [remoteUid]: arrayUnion(...box.list) } }).catch((e) =>
      console.warn("[groupCall] sending ICE candidates failed:", e)
    );
  }

  private closePeer(remoteUid: string, clearSignals: boolean): void {
    const entry = this.peers.get(remoteUid);
    if (entry) {
      this.clearTimer(entry);
      entry.pc.ontrack = null;
      entry.pc.onicecandidate = null;
      entry.pc.oniceconnectionstatechange = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.close();
      this.peers.delete(remoteUid);
    }
    const box = this.iceOutbox.get(remoteUid);
    if (box) clearTimeout(box.timer);
    this.iceOutbox.delete(remoteUid);
    this.detachRemoteAudio(remoteUid);
    if (clearSignals) {
      this.lastSignals.delete(remoteUid);
      this.emitPeerStates();
      if (this.callId && !this.destroyed) {
        updateDoc(this.signalsRef(this.localUid), {
          [`offers.${remoteUid}`]: deleteField(),
          [`answers.${remoteUid}`]: deleteField(),
          [`iceCandidates.${remoteUid}`]: deleteField(),
        }).catch(() => {});
      }
    }
  }

  /* ---------------------------- remote audio + speaking ---------------------------- */

  private attachRemoteAudio(remoteUid: string, stream: MediaStream): void {
    this.detachRemoteAudio(remoteUid);
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    audio.muted = !this.speakerOn;
    this.remoteAudios.set(remoteUid, audio);
    audio.play().catch(() => this.playAfterGesture());
    // Chrome hands an analyser silence for a remote stream that no media element is consuming,
    // which is why the element above exists even though the AudioContext could play it itself.
    this.watchSpeaking(remoteUid, stream);
  }

  private detachRemoteAudio(remoteUid: string): void {
    const audio = this.remoteAudios.get(remoteUid);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.remoteAudios.delete(remoteUid);
    }
    this.unwatchSpeaking(remoteUid);
  }

  /** Browsers may refuse to start audio that wasn't triggered by a click; retry on the next one. */
  private playAfterGesture(): void {
    if (this.resumeHandler || typeof document === "undefined") return;
    this.resumeHandler = () => {
      this.remoteAudios.forEach((a) => a.play().catch(() => {}));
      this.audioCtx?.resume().catch(() => {});
      if (this.resumeHandler) document.removeEventListener("pointerdown", this.resumeHandler);
      this.resumeHandler = null;
    };
    document.addEventListener("pointerdown", this.resumeHandler);
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.audioCtx = new Ctor();
    if (this.audioCtx.state === "suspended") this.audioCtx.resume().catch(() => this.playAfterGesture());
    return this.audioCtx;
  }

  private watchSpeaking(uid: string, stream: MediaStream): void {
    const ctx = this.ensureAudioContext();
    if (!ctx || stream.getAudioTracks().length === 0) return;
    this.unwatchSpeaking(uid);
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // deliberately NOT connected to ctx.destination — that would echo
    this.analysers.set(uid, { analyser, source, data: new Uint8Array(new ArrayBuffer(analyser.fftSize)) });
    if (!this.speakingTimer) this.speakingTimer = setInterval(() => this.pollSpeaking(), 100);
  }

  private unwatchSpeaking(uid: string): void {
    const a = this.analysers.get(uid);
    if (a) {
      try {
        a.source.disconnect();
      } catch {
        /* already disconnected */
      }
      this.analysers.delete(uid);
    }
    this.lastLoud.delete(uid);
    this.publishSpeaking(uid, false);
  }

  private pollSpeaking(): void {
    const now = Date.now();
    this.analysers.forEach(({ analyser, data }, uid) => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const loud = uid === this.localUid && this.muted ? false : Math.sqrt(sum / data.length) > SPEAKING_THRESHOLD;
      if (loud) this.lastLoud.set(uid, now);
      this.publishSpeaking(uid, now - (this.lastLoud.get(uid) ?? 0) < SPEAKING_HOLD_MS);
    });
  }

  private publishSpeaking(uid: string, isSpeaking: boolean): void {
    if (!!this.speaking[uid] === isSpeaking) return;
    if (isSpeaking) this.speaking[uid] = true;
    else delete this.speaking[uid];
    this.callbacks.onSpeaking?.({ ...this.speaking });
  }

  /* -------------------------------- teardown -------------------------------- */

  /** Hangs up every link, stops the mic, releases the AudioContext, and removes my signaling doc.
   * Safe to call more than once. */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.speakingTimer) clearInterval(this.speakingTimer);
    this.speakingTimer = null;
    if (this.resumeHandler) document.removeEventListener("pointerdown", this.resumeHandler);
    this.resumeHandler = null;

    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    Array.from(this.peers.keys()).forEach((uid) => this.closePeer(uid, false));
    Array.from(this.remoteAudios.keys()).forEach((uid) => this.detachRemoteAudio(uid));
    this.analysers.forEach((a) => {
      try {
        a.source.disconnect();
      } catch {
        /* ignore */
      }
    });
    this.analysers.clear();
    this.iceOutbox.forEach((b) => clearTimeout(b.timer));
    this.iceOutbox.clear();
    this.joined.clear();
    this.lastSignals.clear();

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this.audioCtx) await this.audioCtx.close().catch(() => {});
    this.audioCtx = null;
    this.speaking = {};
    if (this.callId) await deleteDoc(this.signalsRef(this.localUid)).catch(() => {});
  }
}
