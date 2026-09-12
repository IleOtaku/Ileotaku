'use client';
import { useAuth } from '@/hooks/useAuth';
import { isAdsFree } from '@/lib/ads';

/**
 * Beta feedback / ads overhaul: this used to load Monetag's "Multitag" script (zone 278904,
 * quge5.com) — a single tag that can serve push-notification permission prompts, popunders, and
 * full-screen redirect ads, none of which this app wants anywhere. Replaced with Monetag's
 * In-Page Push zone (11773153, nap5k.com) — a banner-style ad format only, no popunders, no push
 * permission requests, no redirects, no full-screen takeovers. Not currently mounted anywhere in
 * the app (superseded by ReaderAdScript.tsx, the reader-scoped version of this exact snippet) —
 * kept in sync with it anyway so this file is never a forgotten copy of the old, unsafe script if
 * something ever re-adopts it.
 */
export default function MonetagScript() {
  const { profile, loading } = useAuth();

  if (loading) return null;
  if (isAdsFree(profile)) return null;

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(s){s.dataset.zone='11773153',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))`,
      }}
    />
  );
}
