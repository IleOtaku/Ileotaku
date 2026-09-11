'use client';
import Script from 'next/script';
import { useAuth } from '@/hooks/useAuth';
import { usePathname } from 'next/navigation';

export default function ReaderAdScript() {
  const { profile, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return null;
  if (profile?.isPlatinum) return null;

  // Only load on reader and manga/story pages
  const isReaderPage = pathname?.startsWith('/reader') ||
                       pathname?.startsWith('/manga/') ||
                       pathname?.startsWith('/story/');

  if (!isReaderPage) return null;

  return (
    <Script
      src="https://quge5.com/88/tag.min.js"
      data-zone="278904"
      async
      data-cfasync="false"
      strategy="afterInteractive"
    />
  );
}
