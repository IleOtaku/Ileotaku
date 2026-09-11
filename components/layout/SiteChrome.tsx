"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";
import Navbar from "./Navbar";

/**
 * Renders the Navbar/Footer around every page except the immersive routes below, which
 * provide their own full-height chrome instead of the standard site layout:
 * - /auth/*    — the split-screen AuthLayout shell
 * - /reader*   — the full-height manga reader, which needs the whole viewport and its own
 *                back/nav controls rather than the global navbar + footer squeezed around it
 * - /story/*   — the prose reader, same reasoning (its own sticky header + reading-theme
 *                background, which a global navbar bar would visually clash with)
 * - /banned    — the full-page ban notice, which shouldn't offer normal site navigation away
 *                from itself
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isImmersiveRoute =
    pathname?.startsWith("/auth") ||
    pathname?.startsWith("/reader") ||
    pathname?.startsWith("/story") ||
    pathname?.startsWith("/banned") ||
    pathname?.startsWith("/feed") ||
    false;

  if (isImmersiveRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen">{children}</div>
      <Footer />
    </>
  );
}
