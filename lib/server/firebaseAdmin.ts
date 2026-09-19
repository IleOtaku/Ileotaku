/**
 * Server-only helpers for API routes that need real authority over Firestore — payouts, bank
 * details, balances. Nothing here may be imported from a client component (it pulls in
 * firebase-admin and reads the service-account secret).
 *
 * Every privileged route derives WHO is calling from a verified Firebase ID token
 * (`Authorization: Bearer <idToken>`) and then looks their role up in Firestore itself — a uid or
 * role sent in a request body is never trusted.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function adminDb() {
  if (!getApps().length) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!json) throw new HttpError(500, "FIREBASE_SERVICE_ACCOUNT is not configured.");
    initializeApp({ credential: cert(JSON.parse(json)) });
  }
  return getFirestore();
}

export type CallerRole = "user" | "accountant" | "super";

export interface Caller {
  uid: string;
  profile: Record<string, unknown>;
  isSuperAdmin: boolean;
  isAccountant: boolean;
}

/** Verifies the bearer token and loads the caller's profile. `minRole` gates the route:
 *  - "user": any signed-in account
 *  - "accountant": an Accountant OR Super Admin (read-side finance access)
 *  - "super": Super Admin only (approving/sending money) — an admin whose adminType is "super" or
 *    unset (the original, un-typed admin account), never an accountant or sub-admin. */
export async function authenticate(request: Request, minRole: CallerRole = "user"): Promise<Caller> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Please sign in again.");

  let uid: string;
  try {
    adminDb(); // ensures the app is initialised before getAuth()
    uid = (await getAuth().verifyIdToken(token)).uid;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Your session has expired — please sign in again.");
  }

  const snap = await adminDb().collection("users").doc(uid).get();
  if (!snap.exists) throw new HttpError(403, "Account not found.");
  const profile = snap.data() as Record<string, unknown>;
  const isAdmin = profile.isAdmin === true;
  const adminType = profile.adminType as string | undefined;
  const isSuperAdmin = isAdmin && (adminType === undefined || adminType === "super");
  const isAccountant = isAdmin && adminType === "accountant";

  if (minRole === "super" && !isSuperAdmin) throw new HttpError(403, "Only a Super Admin can do this.");
  if (minRole === "accountant" && !isSuperAdmin && !isAccountant) throw new HttpError(403, "Finance access required.");

  return { uid, profile, isSuperAdmin, isAccountant };
}

/** Wraps a route body so HttpErrors become clean JSON responses and anything else is a generic 500
 * (never leaking internals or secrets in the message). */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("[api] unhandled route error:", error);
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
