import { NextResponse } from "next/server";
import { calculateCreatorEarnings } from "@/lib/earnings";
import { periodBounds, periodKeyOf } from "@/lib/earningsConfig";
import { authenticate, handle } from "@/lib/server/firebaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET -> the CALLER's own estimated earnings so far this month (never anyone else's). Powers the
 * "This month" figure on the creator's Payout tab. */
export async function GET(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "user");
    const { start, end } = periodBounds(periodKeyOf(new Date()));
    const earnings = await calculateCreatorEarnings(caller.uid, start, end);
    return NextResponse.json({ success: true, period: periodKeyOf(start), earnings });
  });
}
