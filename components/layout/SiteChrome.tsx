"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";
import Navbar from "./Navbar";

/**
 * Renders the Navbar/Footer around every page except the immersive routes below, which
 * provide their own full-height chrome instead of the standard site layout:
 * - /auth/*        — the split-screen AuthLayout shell
 * - /reader*       — the full-height manga reader, which needs the whole viewport and its own
 *                    back/nav controls rather than the global navbar + footer squeezed around it
 * - /story/*\/read/* — the prose READER specifically, same reasoning (its own sticky header +
 *                    reading-theme background, which a global navbar bar would visually clash
 *                    with). /story/[workId] itself is the details/landing page (mirrors
 *                    /manga/[id]) and keeps the normal site chrome.
 * - /messages      — beta feedback: "The fact that the dm section is in one big card is
 *                    tiring... make the whole page the dm thing." A DM thread needs the full
 *                    viewport height to feel like iMessage/Telegram instead of a bordered box
 *                    squeezed under the site navbar; it draws its own compact top bar (with its
 *                    own back-to-home link) instead.
 * - /banned        — the full-page ban notice, which shouldn't offer normal site navigation away
 *                    from itself
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isImmersiveRoute =
    pathname?.startsWith("/auth") ||
    pathname?.startsWith("/reader") ||
    /^\/story\/[^/]+\/read(\/|$)/.test(pathname ?? "") ||
    pathname?.startsWith("/banned") ||
    pathname?.startsWith("/feed") ||
    pathname?.startsWith("/messages") ||
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
