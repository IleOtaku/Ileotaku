/**
 * Standalone voice recorder — records to memory only. Nothing touches the network until the caller
 * has the finished Blob and chooses to upload it (the DM composer shows a preview first, then sends).
 *
 * Deliberately knows nothing about React, pointers or buttons: it starts, it stops, it hands back a
 * Blob. Every earlier version of the voice-note feature coupled "stop recording" to detecting a
 * pointer release, which behaves differently on every phone (touchend on an unmounted element,
 * pointercancel from a browser gesture...). Here the only way a recording ends is `stop()`,
 * `cancel()`, or reaching `maxSeconds` — never an input-device event.
 */

/** Length limits: 1 min 30 s for everyone, 10 minutes for Platinum. */
export const VOICE_MAX_SECONDS_FREE = 90;
export const VOICE_MAX_SECONDS_PLATINUM = 600;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

/** "m:ss" — 0:07, 0:42, 1:30. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface VoiceRecording {
  blob: Blob;
  durationSeconds: number;
}

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private startTime = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuffer: Uint8Array | null = null;
  private maxReached = false;

  get isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  /** Whole seconds recorded so far (wall clock, so a throttled background tab can't undercount). */
  get elapsedSeconds(): number {
    return this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
  }

  /** Requests the microphone and starts recording. Rejects if permission is denied or the browser
   * can't record — the caller decides what to tell the user. `onDurationUpdate` is purely for the UI;
   * it can never stop the recording. */
  async start(
    onDurationUpdate: (seconds: number) => void,
    onMaxReached: () => void,
    maxSeconds: number = VOICE_MAX_SECONDS_FREE
  ): Promise<void> {
    if (this.mediaRecorder) throw new Error("Already recording.");
    if (typeof MediaRecorder === "undefined") throw new Error("Voice recording isn't supported in this browser.");

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });

    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || "";

    this.chunks = [];
    this.maxReached = false;
    try {
      this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    } catch (error) {
      this.cleanup();
      throw error;
    }

    // Small timeslice: chunks land in memory every 100 ms, so nothing is held back until stop().
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    // Live input level for the waveform animation. Best-effort — recording never depends on it.
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        this.audioContext = new Ctor();
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        source.connect(this.analyser);
        this.levelBuffer = new Uint8Array(this.analyser.fftSize);
      }
    } catch {
      this.analyser = null;
    }

    this.startTime = Date.now();
    this.mediaRecorder.start(100);

    let lastReported = -1;
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      if (elapsed !== lastReported) {
        lastReported = elapsed;
        onDurationUpdate(Math.min(elapsed, maxSeconds));
      }
      if (elapsed >= maxSeconds && !this.maxReached) {
        this.maxReached = true;
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = null;
        onMaxReached();
      }
    }, 200);
  }

  /** Current input loudness, 0..1 (RMS) — 0 if the analyser isn't available. */
  getLevel(): number {
    if (!this.analyser || !this.levelBuffer) return 0;
    this.analyser.getByteTimeDomainData(this.levelBuffer as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.levelBuffer.length; i++) {
      const v = (this.levelBuffer[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.levelBuffer.length) * 3);
  }

  /** Stops and returns everything recorded, or null if nothing usable was captured. */
  async stop(): Promise<VoiceRecording | null> {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === "inactive") {
      this.cleanup();
      return null;
    }
    const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.cleanup();
        resolve(blob.size > 0 ? { blob, durationSeconds } : null);
      };
      try {
        recorder.stop(); // flushes the final chunk, then fires onstop
      } catch {
        this.cleanup();
        resolve(null);
      }
    });
  }

  /** Throws the recording away. Safe to call in any state. */
  cancel(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    const recorder = this.mediaRecorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // already stopping
        }
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.startTime = 0;
    this.analyser = null;
    this.levelBuffer = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }
}

/** Waveform for the preview and the sent message: `bars` values in 12..100, the loudness of each
 * equal slice of the recording. Uses the browser's own audio decoder; if it can't decode this format
 * (some Safari/webm combinations) it falls back to a stable, natural-looking pattern seeded from the
 * blob's size, so the UI always has something to draw. */
export async function computeWaveform(blob: Blob, bars = 40): Promise<number[]> {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("no AudioContext");
    const ctx = new Ctor();
    try {
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      const data = audio.getChannelData(0);
      const size = Math.floor(data.length / bars) || 1;
      const raw: number[] = [];
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        const start = i * size;
        for (let j = 0; j < size && start + j < data.length; j++) sum += Math.abs(data[start + j]);
        raw.push(sum / size);
      }
      const peak = Math.max(...raw, 0.0001);
      return raw.map((v) => Math.round(12 + (v / peak) * 88));
    } finally {
      ctx.close().catch(() => {});
    }
  } catch {
    return seededWaveform(blob.size, bars);
  }
}

/** Deterministic pseudo-random waveform (so the same message always draws the same bars). */
export function seededWaveform(seed: number, bars = 40): number[] {
  let s = (Math.abs(Math.floor(seed)) % 2147483647) || 1;
  return Array.from({ length: bars }, () => {
    s = (s * 48271) % 2147483647;
    return 20 + Math.round((s / 2147483647) * 75);
  });
}
