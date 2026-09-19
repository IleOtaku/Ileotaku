import { NextResponse } from "next/server";
import { handle } from "@/lib/server/firebaseAdmin";
import { paystack } from "@/lib/server/paystackServer";

/** Nigerian banks for the payout form's selector. The list changes rarely, so the response is cached
 * at the CDN for 24 hours (Cache-Control below) instead of hitting Paystack on every page view. It's
 * force-dynamic rather than statically prerendered so nothing calls Paystack during `next build`. */
export const dynamic = "force-dynamic";

interface PaystackBank {
  name: string;
  code: string;
  active?: boolean;
  is_deleted?: boolean;
}

export async function GET() {
  return handle(async () => {
    const banks: PaystackBank[] = [];
    let cursor: string | null = null;
    // Cursor pagination — perPage is capped by Paystack, and Nigeria has well over one page of banks.
    for (let page = 0; page < 6; page++) {
      const qs = new URLSearchParams({ currency: "NGN", perPage: "100", use_cursor: "true" });
      if (cursor) qs.set("next", cursor);
      const res = await paystack<PaystackBank[]>(`/bank?${qs.toString()}`);
      banks.push(...res.data);
      cursor = res.meta?.next ?? null;
      if (!cursor) break;
    }

    const seen = new Set<string>();
    const list = banks
      .filter((b) => b.active !== false && !b.is_deleted)
      .filter((b) => (seen.has(b.code) ? false : (seen.add(b.code), true)))
      .map(({ name, code }) => ({ name, code }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(list, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } });
  });
}
