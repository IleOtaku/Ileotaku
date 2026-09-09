import type { Metadata } from "next";
import { Suspense } from "react";
import ReaderClient from "@/components/reader/ReaderClient";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Browse Manga",
};

function ReaderFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <Spinner />
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<ReaderFallback />}>
      <ReaderClient />
    </Suspense>
  );
}
