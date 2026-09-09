import Link from "next/link";
import { Crown } from "lucide-react";

export default function PlatinumUpsellBanner() {
  return (
    <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-gold/30 bg-gradient-to-r from-clay/15 via-gold/10 to-plat/10 p-6 sm:flex-row">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Crown className="h-5 w-5" />
        </span>
        <div>
          <p className="font-syne text-sm font-semibold text-text">Go ad-free with Platinum</p>
          <p className="font-noto text-xs text-muted">
            Early chapters, HD pages, and zero ads — from $4/mo.
          </p>
        </div>
      </div>
      <Link href="/pricing" className="btn-gold shrink-0">
        Get Platinum
      </Link>
    </div>
  );
}
