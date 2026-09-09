import type { Metadata } from "next";
import { SectionEyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cookie Policy",
};

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <SectionEyebrow>Legal</SectionEyebrow>
        <h1 className="font-cinzel text-3xl text-gold sm:text-4xl">Cookie Policy</h1>
        <p className="mt-3 font-noto text-xs text-muted">Last updated: September 2025</p>
      </div>

      <div className="prose mt-12 flex max-w-none flex-col gap-6 font-noto text-sm leading-relaxed text-text/75">
        <p>
          Cookies are small text files a website stores in your browser. Here&apos;s a plain
          explanation of what we use them for on ÍléOtaku — no jargon.
        </p>

        <div>
          <h2 className="font-cinzel text-lg text-gold">Keeping You Signed In</h2>
          <p className="mt-2">
            We use cookies and local browser storage so you don&apos;t have to log in every time
            you open the app. Without these, your session wouldn&apos;t persist between visits.
          </p>
        </div>

        <div>
          <h2 className="font-cinzel text-lg text-gold">Remembering Your Preferences</h2>
          <p className="mt-2">
            Things like your reading theme, reader mode, and recent searches are stored locally in
            your browser so they&apos;re there the next time you visit — this data never leaves
            your device.
          </p>
        </div>

        <div>
          <h2 className="font-cinzel text-lg text-gold">Understanding Usage</h2>
          <p className="mt-2">
            We use basic, privacy-respecting analytics to understand how the platform is used —
            which pages are popular, where errors happen — so we can improve it.
          </p>
        </div>

        <div>
          <h2 className="font-cinzel text-lg text-gold">Ads</h2>
          <p className="mt-2">
            Free-tier readers may see ads served by PropellerAds, which can set its own cookies to
            serve and measure ads. Platinum members never see ads and are never served these
            cookies.
          </p>
        </div>

        <div>
          <h2 className="font-cinzel text-lg text-gold">Your Control</h2>
          <p className="mt-2">
            You can clear cookies and local storage, or block them entirely, through your
            browser&apos;s settings at any time. Blocking essential cookies will sign you out and
            may break some features, like staying logged in.
          </p>
        </div>

        <p>
          For more on how we handle your data generally, see our{" "}
          <a href="/privacy" className="text-gold hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
