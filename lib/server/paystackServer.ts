/** Server-only Paystack REST client. PAYSTACK_SECRET_KEY never leaves the server. */
import { HttpError } from "./firebaseAdmin";

const BASE = "https://api.paystack.co";

export interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
  meta?: { next?: string | null };
}

export async function paystack<T>(
  path: string,
  init: RequestInit & { revalidate?: number } = {}
): Promise<PaystackResponse<T>> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new HttpError(500, "Paystack isn't configured on the server.");
  const { revalidate, ...rest } = init;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
      ...(revalidate !== undefined ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
  } catch {
    throw new HttpError(502, "Couldn't reach Paystack. Please try again.");
  }

  const json = (await res.json().catch(() => null)) as PaystackResponse<T> | null;
  if (!json) throw new HttpError(502, "Paystack returned an unreadable response.");
  if (!res.ok || json.status === false) {
    // Paystack's own message is user-safe ("Could not resolve account name", "Insufficient balance"...).
    throw new HttpError(res.status >= 400 && res.status < 500 ? 400 : 502, json.message || "Paystack request failed.");
  }
  return json;
}

/** Naira -> kobo, the unit Paystack's transfer/balance APIs use. Rounded to avoid float dust. */
export const toKobo = (naira: number) => Math.round(naira * 100);
export const fromKobo = (kobo: number) => kobo / 100;
