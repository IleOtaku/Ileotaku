import { NextResponse } from "next/server";
import { claimAd } from "@/lib/server/adRewards";
import { HttpError, authenticate, handle } from "@/lib/server/firebaseAdmin";

export const dynamic = "force-dynamic";

/** POST { sessionId } -> counts a finished ad and pays out (coins / chapter progress / Platinum burst). Verifies on
 * the server that the ad's full length has passed and that the session is unclaimed and the caller's own. */
export async function POST(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "user");
    const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
    if (typeof body.sessionId !== "string" || !body.sessionId) throw new HttpError(400, "Missing ad session.");
    return NextResponse.json({ success: true, ...(await claimAd(caller.uid, body.sessionId)) });
  });
}
