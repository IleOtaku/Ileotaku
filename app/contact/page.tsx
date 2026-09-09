import type { Metadata } from "next";
import { Mail, MessageCircle, ShieldAlert } from "lucide-react";
import ContactForm from "@/components/contact/ContactForm";
import { SectionEyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Contact",
};

const CONTACT_CHANNELS = [
  {
    icon: MessageCircle,
    label: "General Support",
    email: "hello@ileotaku.com",
    text: "Account issues, billing questions, or anything else.",
  },
  {
    icon: Mail,
    label: "Creator Support",
    email: "creator@ileotaku.com",
    text: "Submission status, payouts, and copyright questions.",
  },
  {
    icon: ShieldAlert,
    label: "Data & Privacy",
    email: "privacy@ileotaku.com",
    text: "Data requests, corrections, or deletion — see our Privacy Policy for your rights.",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <SectionEyebrow>Get In Touch</SectionEyebrow>
        <h1 className="font-cinzel text-3xl text-text sm:text-4xl">Contact Us</h1>
        <p className="mx-auto mt-3 max-w-xl font-noto text-sm text-muted">
          Questions, feedback, or something not working right? We&apos;d love to hear from you.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-4">
          {CONTACT_CHANNELS.map((c) => (
            <div key={c.label} className="rounded-2xl border border-bg4 bg-bg2 p-5">
              <c.icon className="h-5 w-5 text-gold" />
              <p className="mt-3 font-syne text-sm font-semibold text-text">{c.label}</p>
              <p className="mt-1 font-noto text-xs text-muted">{c.text}</p>
              <a
                href={`mailto:${c.email}`}
                className="mt-2 inline-block font-noto text-xs font-semibold text-gold hover:underline"
              >
                {c.email}
              </a>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-bg4 bg-bg2 p-6">
          <h2 className="font-syne text-base font-semibold text-text">Send us a message</h2>
          <p className="mt-1 font-noto text-xs text-muted">
            We typically reply within 1-2 business days.
          </p>
          <div className="mt-5">
            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}
