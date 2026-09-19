import { NextResponse } from "next/server";
import { calculateAllCreatorEarnings } from "@/lib/earnings";
import { periodBounds } from "@/lib/earningsConfig";
import { authenticate, handle, HttpError } from "@/lib/server/firebaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { period: "YYYY-MM" } -> every creator's calculated earnings for that month. Accountant or
 * Super Admin only. */
export async function POST(request: Request) {
  return handle(async () => {
    await authenticate(request, "accountant");
    const { period } = (await request.json().catch(() => ({}))) as { period?: string };
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new HttpError(400, "Choose a valid month.");

    const { start, end } = periodBounds(period);
    if (start.getTime() > Date.now()) throw new HttpError(400, "That month hasn't started yet.");

    const creators = await calculateAllCreatorEarnings(start, end);
    return NextResponse.json({
      success: true,
      period,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      creators,
    });
  });
}
