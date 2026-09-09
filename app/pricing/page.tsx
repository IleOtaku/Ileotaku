import type { Metadata } from "next";
import CtaBanner from "@/components/landing/CtaBanner";
import CoinPackages from "@/components/pricing/CoinPackages";
import ComparisonTable from "@/components/pricing/ComparisonTable";
import FaqAccordion from "@/components/pricing/FaqAccordion";
import HeroAndPlans from "@/components/pricing/HeroAndPlans";
import PlatinumSpotlight from "@/components/pricing/PlatinumSpotlight";

export const metadata: Metadata = {
  title: "Pricing & Platinum",
};

export default function PricingPage() {
  return (
    <div>
      <HeroAndPlans />
      <CoinPackages />
      <ComparisonTable />
      <PlatinumSpotlight />
      <FaqAccordion />
      <CtaBanner />
    </div>
  );
}
