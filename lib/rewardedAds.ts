import { auth } from "./firebase";
import type { AdPurpose, AdStatus } from "./adConfig";
import type { ClaimResult } from "./server/adRewards";

/** Client wrappers for the rewarded-ad API (app/api/ads/*). The rules and limits are enforced on the server —
 * these only carry the caller's ID token and turn failures into readable errors. */
export type { ClaimResult };

async function call<T>(path: string, init?: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in to watch ads for rewards.");
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string } & T;
  if (!res.ok || data.success === false) throw new Error(data.message ?? "Something went wrong. Please try again.");
  return data;
}

export async function fetchAdStatus(): Promise<AdStatus> {
  return (await call<{ status: AdStatus }>("/api/ads/status")).status;
}

export function startAd(purpose: AdPurpose, target?: { mangaId?: string; chapterId?: string }) {
  return call<{ sessionId: string; seconds: number }>("/api/ads/start", { method: "POST", body: { purpose, ...target } });
}

export function claimAd(sessionId: string) {
  return call<ClaimResult>("/api/ads/claim", { method: "POST", body: { sessionId } });
}
