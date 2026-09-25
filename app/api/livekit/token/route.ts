import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { HttpError, adminDb, authenticate, handle } from "@/lib/server/firebaseAdmin";
import { groupCallRoomName } from "@/lib/livekitRoom";

export const dynamic = "force-dynamic";

/**
 * Mints a LiveKit join token for a group call's SFU room. `roomName` is never taken from the
 * client and never trusted as-is — it's derived from `callId` server-side, and the caller must
 * actually be a participant of that Firestore call, so nobody can mint a token onto a call they
 * were never invited to just by guessing/adjusting a room name. Same trust model as
 * app/api/tip-creator/route.ts: the caller's identity comes from a verified ID token, never from
 * the request body.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "user");
    const body = (await request.json().catch(() => ({}))) as { callId?: string };
    if (typeof body.callId !== "string" || !body.callId) throw new HttpError(400, "Missing call id.");

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) throw new HttpError(500, "Voice calling isn't configured yet.");

    const callSnap = await adminDb().collection("groupCalls").doc(body.callId).get();
    if (!callSnap.exists) throw new HttpError(404, "This call no longer exists.");
    const call = callSnap.data()!;
    const participantUids = (call.participantUids as string[]) ?? [];
    if (!participantUids.includes(caller.uid)) throw new HttpError(403, "You're not on this call.");

    const displayName = (caller.profile.displayName as string) || "Member";
    const at = new AccessToken(apiKey, apiSecret, { identity: caller.uid, name: displayName, ttl: "4h" });
    at.addGrant({ roomJoin: true, room: groupCallRoomName(body.callId), canPublish: true, canSubscribe: true, canPublishData: true });

    return NextResponse.json({ success: true, token: await at.toJwt() });
  });
}
