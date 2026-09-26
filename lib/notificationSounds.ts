"use client";

/**
 * Beta feedback: "Update the sound system to use 6 audio files with context-aware playback."
 * Replaces the previous Web Audio API oscillator-synthesized sounds with real files under
 * public/sounds/ — cached HTMLAudioElements (via `getAudio`) so repeat playback is instant rather
 * than re-decoding the file every time.
 */

const audioCache = new Map<string, HTMLAudioElement>();

function getAudio(src: string): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let audio = audioCache.get(src);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = "auto";
    audioCache.set(src, audio);
  }
  return audio;
}

function playSound(src: string, volume = 0.7): void {
  const audio = getAudio(src);
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch (error) {
    console.warn("Sound playback failed:", error);
  }
}

/** Beta feedback: "Preload all sounds on app init" — called once, after the user's first
 * click/touch anywhere on the page (see app/layout.tsx), so the very first real playback doesn't
 * pay a network+decode cost, and so the browser's autoplay policy (which blocks audio started
 * with no prior user gesture) never gets a chance to block it. */
export function preloadSounds(): void {
  [
    "/sounds/notification.mp3",
    "/sounds/ringtone.mp3",
    "/sounds/call-ended.mp3",
    "/sounds/story.mp3",
    "/sounds/message.mp3",
    "/sounds/message-out.mp3",
  ].forEach((src) => getAudio(src));
}

// ─────────────────────────────────────────────
// CONTEXT-AWARE MESSAGE SOUNDS
// ─────────────────────────────────────────────

/**
 * Call this for every message MessagesClient's own conversation subscription reports as
 * genuinely new (never for the initial snapshot when a thread is first opened) — own and other
 * people's messages alike.
 *
 * @param isActiveThread - true if the user is currently viewing the /messages page at all.
 * @param isOwnMessage - true if the current user sent this message.
 * @param fromConversationId - which conversation the message came from.
 * @param activeConversationId - which conversation the user is currently viewing, or null.
 */
export function playIncomingMessageSound(
  isActiveThread: boolean,
  isOwnMessage: boolean,
  fromConversationId: string,
  activeConversationId: string | null
): void {
  if (isOwnMessage) {
    // Own message, sent from the thread you're actively looking at — outgoing sound. A push/sync
    // echo of something you sent while looking at another conversation (or away from /messages
    // entirely) gets no sound at all — you already know you sent it.
    if (isActiveThread && fromConversationId === activeConversationId) {
      playSound("/sounds/message-out.mp3", 0.6);
    }
    return;
  }

  if (isActiveThread && fromConversationId === activeConversationId) {
    // Someone else's message, in the thread you're actively viewing.
    playSound("/sounds/message.mp3", 0.7);
  } else {
    // A different conversation, or the app is in the background.
    playSound("/sounds/notification.mp3", 0.7);
  }
}

// ─────────────────────────────────────────────
// OTHER NOTIFICATION SOUNDS
// ─────────────────────────────────────────────

/** All non-DM notifications: likes, follows, comments, chapter releases, announcements, etc. */
export function playNotificationSound(): void {
  playSound("/sounds/notification.mp3", 0.7);
}

/** Story posted by someone you follow. */
export function playStorySound(): void {
  playSound("/sounds/story.mp3", 0.5);
}

// ─────────────────────────────────────────────
// CALL SOUNDS
// ─────────────────────────────────────────────

let ringtoneAudio: HTMLAudioElement | null = null;

/** Incoming/outgoing call — loops until stopped. Returns a stop function; call it the moment the
 * call is answered, declined, or cancelled. */
export function playRingtone(): () => void {
  const audio = getAudio("/sounds/ringtone.mp3");
  if (audio) {
    try {
      audio.loop = true;
      audio.volume = 0.8;
      audio.currentTime = 0;
      audio.play().catch(() => {});
      ringtoneAudio = audio;
    } catch {
      // Autoplay/decoding failure — the call still proceeds silently either way.
    }
  }

  return () => {
    if (ringtoneAudio) {
      ringtoneAudio.pause();
      ringtoneAudio.loop = false;
      ringtoneAudio.currentTime = 0;
      ringtoneAudio = null;
    }
  };
}

/** Call ended, declined, or missed. */
export function playCallEndedSound(): void {
  playSound("/sounds/call-ended.mp3", 0.6);
}
