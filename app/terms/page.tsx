import type { Metadata } from "next";
import Link from "next/link";
import { SectionEyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of Service",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-cinzel text-lg text-gold sm:text-xl">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 font-noto text-sm leading-relaxed text-text/75">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <SectionEyebrow>Legal</SectionEyebrow>
        <h1 className="font-cinzel text-3xl text-gold sm:text-4xl">Terms of Service</h1>
        <p className="mt-3 font-noto text-xs text-muted">Last updated: September 2025</p>
      </div>

      <div className="prose mt-12 flex max-w-none flex-col gap-10">
        <Section title="Acceptance of Terms">
          <p>
            By creating an account or using ÍléOtaku, you agree to these Terms of Service and our{" "}
            <Link href="/privacy" className="text-gold hover:underline">
              Privacy Policy
            </Link>
            . If you don&rsquo;t agree, please don&rsquo;t use the platform.
          </p>
        </Section>

        <Section title="Account Requirements">
          <p>
            You must be at least 13 years old to create an account, provide accurate information,
            and keep it up to date. Accounts are for individual use — one account per person. You&rsquo;re
            responsible for keeping your credentials secure and for all activity under your account.
          </p>
        </Section>

        <Section title="Acceptable Use">
          <p>
            No illegal content, harassment, impersonation of others, or spam. We may remove
            content or restrict accounts that violate these standards, with moderation actions
            ranging from a warning to a permanent ban depending on severity.
          </p>
        </Section>

        <Section title="Content Rules">
          <p>
            The following are never permitted on ÍléOtaku, with zero tolerance: content that
            sexualizes or exploits minors in any way, graphic violence posted for shock value
            rather than narrative purpose, and hate speech targeting any group. Violations result
            in immediate account termination and, where required, a report to the relevant
            authorities.
          </p>
        </Section>

        <Section title="Creator Terms">
          <p>
            Creators retain full copyright over the original work they publish. By submitting a
            work, you grant ÍléOtaku a non-exclusive license to host, display, and distribute it
            on the platform — we never take ownership of what you create. You confirm you own the
            rights to everything you upload, or have permission to publish it. See the{" "}
            <Link href="/creator-agreement" className="text-gold hover:underline">
              Creator Agreement
            </Link>{" "}
            for the full terms creators agree to, including revenue share and payout details.
          </p>
        </Section>

        <Section title="Payment Terms">
          <p>
            Coin purchases are non-refundable except where required by law. A Platinum
            subscription renews automatically and, if you cancel, stays active until the end of
            the period you already paid for rather than ending immediately. Chargebacks or
            payment disputes made in bad faith may result in account suspension.
          </p>
        </Section>

        <Section title="Intellectual Property">
          <p>
            The ÍléOtaku name, logo, and platform design are our intellectual property. You may
            not use them without permission, separate from your rights to your own published
            content as described above.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            We may suspend or terminate accounts that violate these terms, with or without
            notice, depending on severity. You may delete your own account at any time from
            Settings.
          </p>
        </Section>

        <Section title="Limitation of Liability">
          <p>
            ÍléOtaku is provided &ldquo;as is&rdquo; without warranties of any kind. We aren&rsquo;t
            liable for content posted by creators or other users, or for service interruptions
            beyond our reasonable control.
          </p>
        </Section>

        <Section title="Governing Law">
          <p>These terms are governed by the laws of Nigeria, and any dispute is subject to the exclusive jurisdiction of the courts of Lagos, Nigeria.</p>
        </Section>

        <Section title="Changes to Terms">
          <p>
            We may update these terms from time to time. We&rsquo;ll give at least 30 days&rsquo; notice of
            material changes by email before they take effect; continued use of ÍléOtaku after
            that means you accept the updated terms.
          </p>
        </Section>
      </div>
    </div>
  );
}
