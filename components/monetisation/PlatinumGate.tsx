"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export interface PlatinumGateProps {
  children: ReactNode;
  title?: string;
  description?: string;
  /** Use for small toolbar-sized controls (HD/Offline buttons) instead of the full blur overlay. */
  compact?: boolean;
}

/** Wraps Platinum-only content: renders it normally for Platinum members, else shows a locked state. */
export default function PlatinumGate({
  children,
  title = "Platinum Exclusive",
  description = "Upgrade to unlock this feature.",
  compact = false,
}: PlatinumGateProps) {
  const { profile } = useAuth();
  const isPlatinum = profile?.isPlatinum === true;

  if (isPlatinum) {
    return <>{children}</>;
  }

  if (compact) {
    return (
      <Link
        href="/pricing"
        title={description}
        className="flex items-center gap-1 rounded-lg border border-muted2 bg-bg3 px-2.5 py-1.5 font-noto text-xs text-muted transition-colors hover:border-plat hover:text-plat2"
      >
        <Lock className="h-3.5 w-3.5" />
        {title}
      </Link>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div aria-hidden className="pointer-events-none select-none blur-sm">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/75 p-4 text-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-plat/15 text-plat2">
          <Lock className="h-4 w-4" />
        </span>
        <span className="badge-plat">{title}</span>
        <p className="max-w-xs font-noto text-xs text-muted">{description}</p>
        <Link href="/pricing" className="btn-plat text-xs">
          Get Platinum
        </Link>
      </div>
    </div>
  );
}
