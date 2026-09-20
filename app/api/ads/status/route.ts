import { NextResponse } from "next/server";
import { getAdStatus } from "@/lib/server/adRewards";
import { authenticate, handle } from "@/lib/server/firebaseAdmin";

export const dynamic = "force-dynamic";

/** GET -> today's rewarded-ad counters for the caller (see lib/adConfig.ts for the rules). */
export async function GET(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "user");
    return NextResponse.json({ success: true, status: await getAdStatus(caller.uid) });
  });
}
