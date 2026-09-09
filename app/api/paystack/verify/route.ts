import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side Paystack verification — the only place PAYSTACK_SECRET_KEY is used, so it
 * never reaches the browser. Called by lib/paystack.ts's verifyPaystackPayment().
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");
  if (!reference) {
    return NextResponse.json({ success: false, message: "Missing reference." }, { status: 400 });
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { success: false, message: "Paystack secret key isn't configured." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
        cache: "no-store",
      }
    );
    const data = (await res.json()) as { data?: { status?: string } };
    const success = res.ok && data?.data?.status === "success";
    return NextResponse.json({ success, data: data?.data ?? null });
  } catch {
    return NextResponse.json(
      { success: false, message: "Verification request failed." },
      { status: 502 }
    );
  }
}
