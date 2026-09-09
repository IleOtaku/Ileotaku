"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import BugReportModal from "./BugReportModal";

const EXPLORE_LINKS = [
  { label: "Browse Manga", href: "/reader" },
  { label: "Explore", href: "/explore" },
  { label: "New Releases", href: "/explore#new-releases" },
  { label: "Pricing", href: "/pricing" },
];

const CREATOR_LINKS = [
  { label: "Become a Creator", href: "/creator" },
  { label: "Creator Dashboard", href: "/creator" },
  { label: "Submission Guidelines", href: "/creator" },
  { label: "Payouts", href: "/creator" },
];

const COMPANY_LINKS = [
  { label: "About", href: "/about" },
  { label: "Help Center", href: "/help" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Creator Agreement", href: "/creator-agreement" },
  { label: "Cookie Policy", href: "/cookies" },
];

/** Four-column site footer: brand + tagline, then Explore / Creators / Company link columns. */
export default function Footer() {
  const [bugModalOpen, setBugModalOpen] = useState(false);

  return (
    <footer className="border-t border-bg4 bg-bg2">
      <div className="kente-bar" />
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="flex items-center gap-2 font-cinzel text-xl font-bold text-gold">
            <Image src="/icons/icon-32.png" alt="ÍléOtaku" width={28} height={28} className="h-6 w-6 rounded-md md:h-7 md:w-7" />
            Ílé<span className="text-clay">Otaku</span>
          </Link>
          <p className="mt-3 max-w-xs font-noto text-sm text-muted">
            Born from the Motherland — Africa&apos;s home for manga and comics, in every language,
            for every reader.
          </p>
        </div>

        <div>
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Explore</h3>
          <ul className="flex flex-col gap-2">
            {EXPLORE_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="font-noto text-sm text-muted transition-colors hover:text-gold"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Creators</h3>
          <ul className="flex flex-col gap-2">
            {CREATOR_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="font-noto text-sm text-muted transition-colors hover:text-gold"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Company</h3>
          <ul className="flex flex-col gap-2">
            {COMPANY_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="font-noto text-sm text-muted transition-colors hover:text-gold"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setBugModalOpen(true)}
                className="font-noto text-sm text-muted transition-colors hover:text-gold"
              >
                Report a Bug
              </button>
            </li>
          </ul>
        </div>
      </div>

      <BugReportModal open={bugModalOpen} onClose={() => setBugModalOpen(false)} />

      <div className="border-t border-bg4 px-4 py-4 text-center font-noto text-xs text-muted sm:px-6">
        <p>© {new Date().getFullYear()} ÍléOtaku. All rights reserved.</p>
        <p className="mt-1">
          Manga content via{" "}
          <a
            href="https://mangadex.org"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-gold"
          >
            MangaDex
          </a>{" "}
          ·{" "}
          <a
            href="https://comick.io"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-gold"
          >
            Comick
          </a>{" "}
          ·{" "}
          <Link href="/creator" className="transition-colors hover:text-gold">
            our creators
          </Link>
        </p>
      </div>
    </footer>
  );
}
