/**
 * Beta feedback: "Change the ringtone to our own ringtone... like snapchat does... notifications can
 * have the chimes but ringtones different."
 *
 * Calls now have their own sound, deliberately unlike the notification chime (lib/notificationSound.ts,
 * a quick two-note blip): an original bell-like motif that climbs a bright pentatonic run and settles
 * back down, repeating every ~2.6s — long and melodic enough that you know it's a CALL from across the
 * room. The person calling hears a softer two-tone "ringback" pulse instead. Synthesized with the Web
 * Audio API (bell = a sine plus a slightly detuned octave partial with a fast decay), so it's a genuine
 * asset of our own and needs no audio file.
 *
 * Browsers only allow audio after the user has interacted with the page; if the AudioContext is still
 * suspended (a call arriving on a tab nobody has touched) it simply resumes on the first tap/keypress.
 */
export type RingtoneKind = "incoming" | "outgoing";

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx || ctx.state === "closed") ctx = new Ctor();
  return ctx;
}

/** One struck-bell note: fundamental + shimmer partial, instant attack, exponential decay. */
function bell(ac: AudioContext, out: AudioNode, freq: number, start: number, length: number, peak: number): void {
  for (const [mult, level, decay] of [
    [1, 1, length],
    [2.01, 0.35, length * 0.6],
  ] as const) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak * level, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + decay + 0.05);
  }
}

// G5 B5 D6 G6 … D6 B5 G5 — up the G-major arpeggio and back, [frequency Hz, offset seconds].
const INCOMING_PHRASE: ReadonlyArray<readonly [number, number]> = [
  [784, 0],
  [988, 0.14],
  [1175, 0.28],
  [1568, 0.42],
  [1175, 0.72],
  [988, 0.86],
  [784, 1.0],
];
const INCOMING_PERIOD = 2.6;
const OUTGOING_PERIOD = 3.2;

/** Starts looping the ringtone. Returns a function that stops it (fades out, then tears down). */
export function startRingtone(kind: RingtoneKind): () => void {
  const ac = getContext();
  if (!ac) return () => {};
  const master = ac.createGain();
  master.gain.value = kind === "incoming" ? 0.5 : 0.28;
  master.connect(ac.destination);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resumeOnGesture: (() => void) | null = null;

  const waitForGesture = () => {
    if (resumeOnGesture || typeof document === "undefined") return;
    resumeOnGesture = () => {
      ac.resume().catch(() => {});
      if (resumeOnGesture) document.removeEventListener("pointerdown", resumeOnGesture);
      resumeOnGesture = null;
    };
    document.addEventListener("pointerdown", resumeOnGesture);
  };

  const loop = () => {
    if (stopped) return;
    if (ac.state === "suspended") {
      ac.resume().catch(() => {});
      waitForGesture();
    }
    const t = ac.currentTime + 0.05;
    if (kind === "incoming") {
      for (const [f, off] of INCOMING_PHRASE) bell(ac, master, f, t + off, 0.7, 0.55);
    } else {
      bell(ac, master, 440, t, 1.1, 0.4);
      bell(ac, master, 554, t + 0.03, 1.1, 0.3);
    }
    timer = setTimeout(loop, (kind === "incoming" ? INCOMING_PERIOD : OUTGOING_PERIOD) * 1000);
  };
  loop();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (resumeOnGesture && typeof document !== "undefined") document.removeEventListener("pointerdown", resumeOnGesture);
    resumeOnGesture = null;
    master.gain.setTargetAtTime(0, ac.currentTime, 0.04);
    setTimeout(() => master.disconnect(), 300);
  };
}
