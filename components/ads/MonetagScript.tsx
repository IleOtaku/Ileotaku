'use client';
import Script from 'next/script';
import { useAuth } from '@/hooks/useAuth';

export default function MonetagScript() {
  const { profile } = useAuth();

  if (profile?.isPlatinum) return null;

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
