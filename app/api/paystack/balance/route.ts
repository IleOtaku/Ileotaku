import { NextResponse } from "next/server";
import { authenticate, handle } from "@/lib/server/firebaseAdmin";
import { fromKobo, paystack } from "@/lib/server/paystackServer";

export const dynamic = "force-dynamic";

/** GET -> the platform's current NGN Paystack balance, in Naira. Finance roles only — used by the
 * Super Admin's payout review to warn before approving a run the balance can't cover. */
export async function GET(request: Request) {
  return handle(async () => {
    await authenticate(request, "accountant");
    const res = await paystack<{ currency: string; balance: number }[]>("/balance");
    const ngn = res.data.find((b) => b.currency === "NGN");
    return NextResponse.json({ success: true, balanceNGN: fromKobo(ngn?.balance ?? 0) });
  });
}
