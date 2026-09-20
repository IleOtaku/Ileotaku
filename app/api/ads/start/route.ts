import { NextResponse } from "next/server";
import type { AdPurpose } from "@/lib/adConfig";
import { startAd } from "@/lib/server/adRewards";
import { HttpError, authenticate, handle } from "@/lib/server/firebaseAdmin";

export const dynamic = "force-dynamic";

/** POST { purpose: "coins" | "chapter" | "platinum", mangaId?, chapterId? } -> opens an ad session. Refuses (429)
 * once today's cap for that purpose is used up. */
export async function POST(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "user");
    const body = (await request.json().catch(() => ({}))) as { purpose?: string; mangaId?: string; chapterId?: string };
    if (body.purpose !== "coins" && body.purpose !== "chapter" && body.purpose !== "platinum") throw new HttpError(400, "Unknown ad type.");
    const session = await startAd(caller.uid, body.purpose as AdPurpose, {
      mangaId: typeof body.mangaId === "string" ? body.mangaId.slice(0, 200) : undefined,
      chapterId: typeof body.chapterId === "string" ? body.chapterId.slice(0, 200) : undefined,
    });
    return NextResponse.json({ success: true, ...session });
  });
}
