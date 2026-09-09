import type { Metadata } from "next";
import Link from "next/link";
import { SectionEyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

const THIRD_PARTIES = [
  { name: "Firebase (Google)", href: "https://firebase.google.com/support/privacy" },
  { name: "Cloudinary", href: "https://cloudinary.com/privacy" },
  { name: "Paystack", href: "https://paystack.com/terms" },
  { name: "Spotify", href: "https://www.spotify.com/legal/privacy-policy/" },
  { name: "PropellerAds", href: "https://propellerads.com/privacy-policy/" },
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

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <SectionEyebrow>Legal</SectionEyebrow>
        <h1 className="font-cinzel text-3xl text-gold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 font-noto text-xs text-muted">Last updated: September 2025</p>
      </div>

      <div className="prose mt-12 flex max-w-none flex-col gap-10">
        <Section title="What We Collect">
          <p>
            <strong className="text-text">Account information</strong> — your name, email
            address, handle, and profile photo when you create an account.
          </p>
          <p>
            <strong className="text-text">Reading history</strong> — the titles and chapters you
            read, your progress, ratings, and library.
          </p>
          <p>
            <strong className="text-text">Payment data</strong> — coin purchases and Platinum
            subscription records. We never see or store your card number; that&rsquo;s handled entirely
            by Paystack (see Third Party Services below).
          </p>
          <p>
            <strong className="text-text">Device information</strong> — browser type, operating
            system, and approximate location (from IP address) for security and analytics.
          </p>
          <p>
            <strong className="text-text">Cookies</strong> — small files used to keep you signed
            in and remember your preferences. See our{" "}
            <Link href="/cookies" className="text-gold hover:underline">
              Cookie Policy
            </Link>{" "}
            for details.
          </p>
        </Section>

        <Section title="How We Use It">
          <p>
            We use your information to personalize your reading recommendations, process
            payments and creator payouts, send notifications you&rsquo;ve opted into, moderate content
            for everyone&rsquo;s safety, and improve the platform over time.
          </p>
        </Section>

        <Section title="Data Storage">
          <p>
            Your account and platform data is stored with Firebase, hosted in the EU-West region.
            Images, chapter pages, and other media are delivered through Cloudinary&rsquo;s global CDN.
            Payments are processed by Paystack, based in Nigeria.
          </p>
        </Section>

        <Section title="Third Party Services">
          <p>We work with the following services to run ÍléOtaku. Each has its own privacy policy:</p>
          <ul className="flex flex-col gap-1.5 pl-1">
            {THIRD_PARTIES.map((t) => (
              <li key={t.name}>
                <a
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold hover:underline"
                >
                  {t.name}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Your Rights">
          <p>
            You have the right to access, correct, delete, or receive a portable copy of your
            personal data. You can manage most of this yourself from Profile → Settings, or email{" "}
            <a href="mailto:privacy@ileotaku.com" className="text-gold hover:underline">
              privacy@ileotaku.com
            </a>{" "}
            to exercise any of these rights directly.
          </p>
        </Section>

        <Section title="Children's Privacy">
          <p>
            ÍléOtaku is not intended for anyone under 13, and we don&rsquo;t knowingly collect
            information from children under 13. Some content on the platform is intended for
            mature audiences and requires you to be 18 or older to view it.
          </p>
        </Section>

        <Section title="Nigerian Data Protection">
          <p>
            We process personal data in accordance with the Nigeria Data Protection Act (NDPA)
            and the Nigeria Data Protection Regulation (NDPR). If you&rsquo;re in Nigeria, you have the
            rights described above, and you may lodge a complaint with the Nigeria Data
            Protection Commission if you believe we&rsquo;ve mishandled your data.
          </p>
        </Section>

        <Section title="GDPR">
          <p>
            If you&rsquo;re in the European Economic Area, you have rights under the General Data
            Protection Regulation, including access, rectification, erasure, restriction of
            processing, data portability, and the right to object. Our lawful basis for
            processing is your consent, our contract with you (providing the service), and our
            legitimate interests (security, fraud prevention, improving the platform).
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data? Reach us at{" "}
            <a href="mailto:privacy@ileotaku.com" className="text-gold hover:underline">
              privacy@ileotaku.com
            </a>{" "}
            or through our{" "}
            <Link href="/contact" className="text-gold hover:underline">
              Contact page
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
