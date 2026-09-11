import { doc, setDoc } from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import type { UserProfile } from "@/types";

/**
 * Submits (or resubmits) a banned account's appeal from /banned — one doc per uid, `setDoc`
 * rather than `addDoc` so a second appeal after a denial cleanly overwrites the first instead of
 * piling up documents the admin table would otherwise have to dedupe.
 */
export async function submitAppeal(
  profile: Pick<UserProfile, "uid" | "email" | "displayName" | "bannedReason">,
  reason: string
): Promise<void> {
  try {
    await setDoc(doc(db, "appeals", profile.uid), {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      reason: reason.trim(),
      ...(profile.bannedReason ? { banReason: profile.bannedReason } : {}),
      status: "pending",
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError(error, { operation: "submitAppeal", uid: profile.uid });
    throw error;
  }
}
