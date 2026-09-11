import { addDoc, collection } from "firebase/firestore";
import { auth, db } from "./firebase";

/**
 * Beta feedback triage: the Error Logs admin tab had 478 entries, 212 of which (44% of the
 * total) were this exact Firestore SDK message — a benign, expected condition (the device
 * genuinely had no network for a moment, most often on mobile) that isn't a code bug at all, and
 * drowned out every real signal in the list. Every call site already treats a failed read/write
 * as non-fatal (catches it, falls back to an empty/default value), so silently dropping this one
 * specific message here — rather than teaching every individual catch block to recognize it —
 * is the single, DRY place to stop it from ever reaching the admin's queue again.
 */
const BENIGN_MESSAGES = [/^Failed to get document because the client is offline\.$/];

function isBenign(message: string): boolean {
  return BENIGN_MESSAGES.some((pattern) => pattern.test(message));
}

/**
 * Writes one entry to the `errors` Firestore collection, read by the Technical admin
 * dashboard's Error Logs tab. Deliberately depends on nothing but lib/firebase.ts (not
 * lib/firestore.ts) — every other lib/*.ts module's catch blocks call this, so importing
 * firestore.ts here (which itself would want to log errors) risks a circular import.
 * Never throws: a logging failure must not mask or replace the original error.
 */
export async function logError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    if (isBenign(message)) return;
    const stack = error instanceof Error ? error.stack : undefined;
    const uid = auth.currentUser?.uid;

    await addDoc(collection(db, "errors"), {
      message,
      ...(stack ? { stack } : {}),
      ...(context ? { context } : {}),
      ...(uid ? { uid } : {}),
      status: "open",
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Logging is best-effort — a broken logger must never throw on top of the error it was
    // trying to record, and there's nowhere further to report a failure of the reporter itself.
  }
}
