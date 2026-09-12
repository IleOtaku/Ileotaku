'use client';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname } from 'next/navigation';

/**
 * Beta feedback / ads overhaul: this used to load Monetag's "Multitag" script (zone 278904,
 * quge5.com), which is what was actually firing the push-notification permission prompts and
 * redirect ads reported in feedback — a single Multitag zone can serve push, popunder, and
 * full-screen-redirect formats all at once, none of which belong on this site. Replaced with
 * Monetag's In-Page Push zone (11773153, nap5k.com) — banner-style ads only, no popunders, no
 * push permission requests, no redirects, no full-screen takeovers.
 *
 * Loaded as a raw inline `<script>` (not next/script's `<Script>` component) because Monetag's
 * own snippet works by constructing and appending a new `<script>` element to `documentElement`/
 * `body` itself at call time — that only happens once, on mount, exactly like the vendor's own
 * install snippet expects, whereas next/script's `src`+`data-zone` props (the old approach) is a
 * different, Multitag-specific loading convention this new zone doesn't use.
 */
export default function ReaderAdScript() {
  const { profile, loading } = useAuth();
  const pathname = usePathname();

  // Only load on reader and manga/story pages
  const isReaderPage = pathname?.startsWith('/reader') ||
                       pathname?.startsWith('/manga/') ||
                       pathname?.startsWith('/story/');

  // Beta feedback: "When user navigates AWAY from the reader: force unload and reload the ad
  // script to prevent it following them." This cleanup runs on every unmount AND every pathname
  // change (isReaderPage is a dependency) — the moment the route stops matching a reader path,
  // any script tag or leftover ad element the vendor's snippet injected is torn out immediately,
  // rather than only when this component itself unmounts (which — since it's rendered from the
  // root layout, not per-route — would otherwise never happen on a same-app client navigation).
  useEffect(() => {
    return () => {
      const scripts = document.querySelectorAll('script[src*="nap5k.com"], script[src*="quge5.com"]');
      scripts.forEach((s) => s.remove());
      const adElements = document.querySelectorAll('[id*="monetag"], [id*="propeller"], [class*="ad-container"]');
      adElements.forEach((el) => el.remove());
    };
  }, [isReaderPage]);

  if (loading) return null;
  if (profile?.isPlatinum) return null;
  if (!isReaderPage) return null;

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(s){s.dataset.zone='11773153',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))`,
      }}
    />
  );
}
