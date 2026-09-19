import { NextResponse } from "next/server";
import { authenticate, adminDb, handle, HttpError } from "@/lib/server/firebaseAdmin";
import { paystack } from "@/lib/server/paystackServer";

export const dynamic = "force-dynamic";

/** POST { bankCode, bankName?, accountNumber, accountName?, creatorUid } — creates a Paystack transfer
 * recipient and saves it to users/{uid}/payoutDetails/bank. The account NAME is resolved again here
 * from Paystack rather than trusting the one the browser sends, so a stored "verified" name can
 * never be forged. `creatorUid` must be the caller's own uid. This route is the only writer of
 * payoutDetails (firestore.rules denies client writes to it). */
export async function POST(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "user");
    const body = await request.json().catch(() => ({}));
    const { bankCode, accountNumber, creatorUid } = body as Record<string, string | undefined>;

    if (!creatorUid || creatorUid !== caller.uid) throw new HttpError(403, "You can only save your own payout details.");
    if (!bankCode || !/^\d{2,6}$/.test(bankCode)) throw new HttpError(400, "Choose a bank first.");
    if (!accountNumber || !/^\d{10}$/.test(accountNumber)) throw new HttpError(400, "Account number must be exactly 10 digits.");

    const resolved = await paystack<{ account_name: string }>(
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
    );
    const accountName = resolved.data.account_name;

    const recipient = await paystack<{ recipient_code: string; details: { bank_name?: string } }>("/transferrecipient", {
      method: "POST",
      body: JSON.stringify({
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      }),
    });

    const db = adminDb();
    const details = {
      bankCode,
      bankName: recipient.data.details?.bank_name ?? (body.bankName as string | undefined) ?? "",
      accountNumber,
      accountName,
      recipientCode: recipient.data.recipient_code,
      verified: true as const,
      updatedAt: new Date().toISOString(),
    };
    await db.collection("users").doc(caller.uid).collection("payoutDetails").doc("bank").set(details);

    return NextResponse.json({ success: true, recipientCode: details.recipientCode, accountName, bankName: details.bankName });
  });
}
