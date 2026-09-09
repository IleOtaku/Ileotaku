import Link from "next/link";

// Navbar, kente-bar, and Footer are already applied automatically by SiteChrome (see
// components/layout/SiteChrome.tsx) around every non-immersive route, this one included — this
// file only needs to provide the centered "lost" content between them.
export default function NotFound() {
  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 30%, #c4622d, transparent 45%), radial-gradient(circle at 70% 70%, #d4a843, transparent 45%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        <span className="animate-float text-6xl">📖</span>
        <h1 className="mt-6 font-cinzel text-8xl text-gold">404</h1>
        <h2 className="mt-2 font-cinzel text-xl text-text sm:text-2xl">Lost in the Manga Void</h2>
        <p className="mt-3 max-w-sm font-noto text-sm text-muted">
          This page wandered off into an unknown dimension.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn-primary">
            Go Home
          </Link>
          <Link href="/reader" className="btn-ghost">
            Browse Manga
          </Link>
        </div>
      </div>
    </div>
  );
}
