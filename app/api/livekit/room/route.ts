import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { HttpError, adminDb, authenticate, handle } from "@/lib/server/firebaseAdmin";
import { groupCallRoomName } from "@/lib/livekitRoom";

export const dynamic = "force-dynamic";

/**
 * Pre-creates a group call's LiveKit room with an explicit participant ceiling (LiveKit will
 * otherwise auto-create the room with its project default the moment the first participant
 * connects — this just lets startGroupCall() set GROUP_CALL_MAX up front). Best-effort: the
 * caller in lib/groupCalls.ts doesn't block call creation on this succeeding, since that fallback
 * auto-create still works fine without it.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "user");
    const body = (await request.json().catch(() => ({}))) as { callId?: string; maxParticipants?: number };
    if (typeof body.callId !== "string" || !body.callId) throw new HttpError(400, "Missing call id.");

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    if (!apiKey || !apiSecret || !url) throw new HttpError(500, "Voice calling isn't configured yet.");

    const callSnap = await adminDb().collection("groupCalls").doc(body.callId).get();
    if (!callSnap.exists) throw new HttpError(404, "This call no longer exists.");
    const call = callSnap.data()!;
    if (call.initiatorUid !== caller.uid) throw new HttpError(403, "Only the caller who started this call can set it up.");

    const roomService = new RoomServiceClient(url.replace(/^wss:/, "https:"), apiKey, apiSecret);
    await roomService.createRoom({
      name: groupCallRoomName(body.callId),
      maxParticipants: Math.min(Math.max(body.maxParticipants ?? 500, 2), 500),
      emptyTimeout: 300,
    });
    return NextResponse.json({ success: true });
  });
}
