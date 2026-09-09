import type { Metadata } from "next";
import { Suspense } from "react";
import MessagesClient from "@/components/messages/MessagesClient";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Messages",
};

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <MessagesClient />
    </Suspense>
  );
}
