/**
 * Beta feedback: "Notifications should have a custom sound of our own... get a good 1s or less
 * sound for that." Synthesized via the Web Audio API (a quick two-tone chime) rather than a
 * licensed/borrowed audio file this project has no legitimate way to source or generate as a
 * real asset — this is genuinely "our own" sound, not attributed to anyone else's app.
 */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioCtx) audioCtx = new AudioCtor();
  return audioCtx;
}

function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number, gain: number) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

/** A short rising two-note chime (~0.4s total) — plays for a genuinely new notification, never
 * on the initial load of an already-existing list. Silently no-ops if the browser blocks audio
 * autoplay before the user has interacted with the page at all, which is expected and fine for
 * a nice-to-have chime. */
export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    playTone(ctx, 740, now, 0.16, 0.12);
    playTone(ctx, 988, now + 0.1, 0.22, 0.12);
  } catch {
    // Never let a sound glitch break the actual notification.
  }
}
