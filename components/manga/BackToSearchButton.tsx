"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Used instead of a plain Link when the reader arrived via a search result — router.back()
 * returns to the actual previous history entry (search page, with its query/filters intact)
 * rather than a fresh /search that would lose whatever they'd typed.
 */
export default function BackToSearchButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 rounded-full bg-bg/70 px-3 py-1.5 font-noto text-xs font-semibold text-ivory backdrop-blur transition-colors hover:bg-bg/90"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to Search
    </button>
  );
}
