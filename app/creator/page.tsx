import type { Metadata } from "next";
import CreatorDashboardClient from "@/components/creator/CreatorDashboardClient";

export const metadata: Metadata = {
  title: "Creator Dashboard",
};

export default function CreatorDashboardPage() {
  return <CreatorDashboardClient />;
}
