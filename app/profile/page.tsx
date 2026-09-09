import type { Metadata } from "next";
import { Suspense } from "react";
import ProfileClient from "@/components/profile/ProfileClient";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Profile",
};

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <ProfileClient />
    </Suspense>
  );
}
