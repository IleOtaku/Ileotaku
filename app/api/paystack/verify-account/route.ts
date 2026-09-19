import { NextResponse, type NextRequest } from "next/server";
import { authenticate, handle, HttpError } from "@/lib/server/firebaseAdmin";
import { paystack } from "@/lib/server/paystackServer";

export const dynamic = "force-dynamic";

/** GET ?account_number=&bank_code= -> { account_name }. Signed-in users only: an open endpoint would
 * be a free "who owns this bank account" lookup for anyone on the internet, at our Paystack quota. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await authenticate(request, "user");
    const accountNumber = request.nextUrl.searchParams.get("account_number") ?? "";
    const bankCode = request.nextUrl.searchParams.get("bank_code") ?? "";
    if (!/^\d{10}$/.test(accountNumber)) throw new HttpError(400, "Account number must be exactly 10 digits.");
    if (!/^\d{2,6}$/.test(bankCode)) throw new HttpError(400, "Choose a bank first.");

    const res = await paystack<{ account_number: string; account_name: string }>(
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
    );
    return NextResponse.json({ success: true, account_name: res.data.account_name });
  });
}
