import type { Metadata } from "next";
import { SectionEyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Creator Agreement",
};

const REVENUE_SPLIT = [
  { source: "Chapter coin unlocks", creator: "70%", platform: "30%" },
  { source: "Reader tips", creator: "85%", platform: "15%" },
  { source: "Platinum reads (pooled share)", creator: "60%", platform: "40%" },
  { source: "Feed ad & boost revenue (launch period)", creator: "0%", platform: "100%" },
];

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

export default function CreatorAgreementPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <SectionEyebrow>Legal</SectionEyebrow>
        <h1 className="font-cinzel text-3xl text-gold sm:text-4xl">Creator Agreement</h1>
        <p className="mt-3 font-noto text-xs text-muted">Last updated: September 2025</p>
      </div>

      <div className="prose mt-12 flex max-w-none flex-col gap-10">
        <Section title="Revenue Split">
          <p>What you keep from every way your work earns on ÍléOtaku:</p>
          <div className="overflow-hidden rounded-2xl border border-bg4">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-bg2">
                  <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                    Revenue Source
                  </th>
                  <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-gold2">
                    Creator
                  </th>
                  <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                    Platform
                  </th>
                </tr>
              </thead>
              <tbody>
                {REVENUE_SPLIT.map((row, i) => (
                  <tr key={row.source} className={i % 2 === 0 ? "bg-bg" : "bg-bg2/50"}>
                    <td className="p-3 font-noto text-sm text-text">{row.source}</td>
                    <td className="p-3 font-syne text-sm font-semibold text-gold2">{row.creator}</td>
                    <td className="p-3 font-noto text-sm text-muted">{row.platform}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Copyright Ownership">
          <p>
            You retain full copyright over every work you publish. Submitting to ÍléOtaku grants
            us a non-exclusive license to host, display, and distribute it on the platform — we
            never take ownership, and you&rsquo;re free to publish the same work elsewhere.
          </p>
        </Section>

        <Section title="Content Standards">
          <p>
            Submissions must be original work you created or hold full rights to publish.
            Plagiarized, stolen, or infringing content is removed on discovery and may result in
            account suspension. All the same content rules from our{" "}
            <a href="/terms" className="text-gold hover:underline">
              Terms of Service
            </a>{" "}
            apply — no CSAM, no shock-value graphic violence, no hate speech.
          </p>
        </Section>

        <Section title="Payout Terms">
          <p>
            Earnings are calculated monthly and paid out via Paystack. There is no minimum payout
            threshold for African creators — even a small monthly balance is paid out in full
            rather than held over.
          </p>
        </Section>

        <Section title="Feed Monetization Disclosure">
          <p>
            During the launch period, ÍléOtaku retains 100% of ad and boost revenue generated on
            the Creator Feed (separate from your published manga/manhwa earnings, which follow
            the split above and are unaffected by this). This is disclosed here so it&rsquo;s never a
            surprise — we&rsquo;ll announce clearly if and when Feed monetization terms change.
          </p>
        </Section>

        <Section title="Application and Review Process">
          <p>
            Anyone can activate a free creator account and submit a work. Our editorial team
            reviews new submissions within 5-7 business days for originality and content
            standards before a title goes live.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            We may remove a work or suspend a creator account for repeated content-standard
            violations, confirmed plagiarism, or fraudulent activity. You may withdraw your own
            work or deactivate your creator account at any time from Creator Studio.
          </p>
        </Section>
      </div>
    </div>
  );
}
