/**
 * Beta feedback: "Replace ALL existing notification sounds with unique, non-bell sounds." Every
 * sound here is synthesized with the Web Audio API — no audio files, no licensed/borrowed assets —
 * so each event (DM received, generic notification, incoming call, call ended, new story) gets its
 * own distinct character instead of variations on the same chime. Replaces lib/notificationSound.ts
 * (the old two-tone chime) and lib/ringtone.ts (the old bell-arpeggio ringtone) outright.
 *
 * The AudioContext is created lazily (never at module scope — this file is imported from
 * client components that also render server-side, where `window` doesn't exist) and reused
 * across calls; if it's suspended (autoplay policy, before the user has interacted with the page
 * at all) it just resumes best-effort and no-ops silently on failure, same as the code it replaces.
 */
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx || ctx.state === "closed") ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Message received — soft, low, warm thud. */
export function playMessageSound(): void {
  const ac = getContext();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(280, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.15);

    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ac.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);

    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.25);
  } catch {
    // Never let a sound glitch break the actual notification.
  }
}

/** General notification — two-tone soft pulse. */
export function playNotificationSound(): void {
  const ac = getContext();
  if (!ac) return;
  try {
    [0, 0.12].forEach((delay, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(i === 0 ? 440 : 554, ac.currentTime + delay);

      gain.gain.setValueAtTime(0, ac.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.25, ac.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.2);

      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 0.2);
    });
  } catch {
    // Never let a sound glitch break the actual notification.
  }
}

function ringPulse(ac: AudioContext, gainScale: number): void {
  const osc1 = ac.createOscillator();
  const gain1 = ac.createGain();
  osc1.connect(gain1);
  gain1.connect(ac.destination);
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(120, ac.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.3);
  gain1.gain.setValueAtTime(0.4 * gainScale, ac.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
  osc1.start(ac.currentTime);
  osc1.stop(ac.currentTime + 0.3);

  const osc2 = ac.createOscillator();
  const gain2 = ac.createGain();
  osc2.connect(gain2);
  gain2.connect(ac.destination);
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(320, ac.currentTime + 0.1);
  gain2.gain.setValueAtTime(0.15 * gainScale, ac.currentTime + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
  osc2.start(ac.currentTime + 0.1);
  osc2.stop(ac.currentTime + 0.35);
}

export type RingtoneKind = "incoming" | "outgoing";

/**
 * Call ringtone — deep, rhythmic pulse, looping. Deviates from the literal beta-feedback spec
 * (which gave a single parameterless `playRingtone()`) by keeping the existing incoming/outgoing
 * distinction: an outgoing call still needs its own, quieter "ringback" so the caller can tell
 * they're the one waiting, not the one being rung — losing that would be a real regression, not a
 * neutral swap. `kind` defaults to "incoming". Returns a function that stops the loop.
 */
export function playRingtone(kind: RingtoneKind = "incoming"): () => void {
  const ac = getContext();
  if (!ac) return () => {};

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const gainScale = kind === "incoming" ? 1 : 0.55;
  const periodMs = kind === "incoming" ? 1200 : 1600;

  const loop = () => {
    if (stopped) return;
    if (ac.state === "suspended") ac.resume().catch(() => {});
    ringPulse(ac, gainScale);
    timer = setTimeout(loop, periodMs);
  };
  loop();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/** Call ended / declined — descending tone. */
export function playCallEndedSound(): void {
  const ac = getContext();
  if (!ac) return;
  try {
    [0, 0.1, 0.2].forEach((delay, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(400 - i * 80, ac.currentTime + delay);
      gain.gain.setValueAtTime(0.2, ac.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.15);
      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 0.15);
    });
  } catch {
    // Never let a sound glitch break the actual call teardown.
  }
}

/** New story posted — ascending shimmer. */
export function playStorySound(): void {
  const ac = getContext();
  if (!ac) return;
  try {
    [0, 0.08, 0.16].forEach((delay, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(500 + i * 150, ac.currentTime + delay);
      gain.gain.setValueAtTime(0.15, ac.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.12);
      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 0.12);
    });
  } catch {
    // Never let a sound glitch break anything else on the page.
  }
}
