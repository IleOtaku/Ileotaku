/**
 * Thin wrapper around Paystack's inline checkout (https://js.paystack.co/v1/inline.js).
 * All calls are client-side only — the actual charge is verified server-side afterward via
 * app/api/paystack/verify/route.ts, which is the only place PAYSTACK_SECRET_KEY is used.
 */

export const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";

interface PaystackHandler {
  openIframe(): void;
}

interface PaystackSetupOptions {
  key: string;
  email: string;
  amount: number;
  currency?: string;
  ref?: string;
  metadata?: Record<string, unknown>;
  callback?: (response: { reference: string }) => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    PaystackPop?: {
      setup(options: PaystackSetupOptions): PaystackHandler;
    };
  }
}

const SCRIPT_ID = "paystack-inline-script";
const SCRIPT_SRC = "https://js.paystack.co/v1/inline.js";

/** Loads the Paystack inline script exactly once. Safe to call repeatedly (e.g. per-page). */
export function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (window.PaystackPop) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Paystack.")));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paystack."));
    document.body.appendChild(script);
  });
}

export interface InitializePaymentResult {
  reference: string;
}

/**
 * Opens the Paystack popup for one payment. `amount` is in the currency's major unit
 * (e.g. naira, not kobo) — Paystack itself expects the minor unit, so this converts internally.
 * ÍléOtaku charges in NGN (Paystack merchant accounts are scoped to one settlement currency);
 * callers pass `currency` explicitly rather than relying on this default.
 * Resolves with the transaction reference on success; rejects if the user closes the popup
 * or Paystack isn't configured/loaded.
 */
export function initializePaystackPayment(
  email: string,
  amount: number,
  currency = "NGN",
  metadata: Record<string, unknown> = {}
): Promise<InitializePaymentResult> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.PaystackPop) {
      reject(new Error("Paystack hasn't loaded yet. Please try again in a moment."));
      return;
    }
    if (!PAYSTACK_PUBLIC_KEY) {
      reject(new Error("Payments aren't configured yet — missing Paystack public key."));
      return;
    }

    let settled = false;
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email,
      amount: Math.round(amount * 100),
      currency,
      ref: `ileotaku_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      metadata,
      callback: (response) => {
        settled = true;
        resolve({ reference: response.reference });
      },
      onClose: () => {
        if (!settled) reject(new Error("Payment window closed."));
      },
    });
    handler.openIframe();
  });
}

/** Verifies a Paystack transaction server-side via our own API route. */
export async function verifyPaystackPayment(reference: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
