import { addDoc, collection } from "firebase/firestore";
import { auth, db } from "./firebase";

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
