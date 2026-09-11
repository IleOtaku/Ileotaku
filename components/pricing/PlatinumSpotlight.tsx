import { BarChart3, BookOpenCheck, Crown, Download, Palette, Rocket, Shield, Sparkles, Tag } from "lucide-react";

const PERKS = [
  { icon: Shield, label: "Zero Ads", text: "Read without a single interruption, ever." },
  {
    icon: BookOpenCheck,
    label: "Unlimited Manga",
    text: "Unlimited access to all imported manga — no chapter locks.",
  },
  { icon: Download, label: "Offline", text: "Download chapters to read anywhere, anytime." },
  {
    icon: Rocket,
    label: "Early Access",
    text: "New chapters land in your library before anyone else's.",
  },
  {
    icon: Sparkles,
    label: "HD Quality",
    text: "Every page rendered at full creator-intended resolution.",
  },
  {
    icon: Palette,
    label: "Exclusive Themes",
    text: "Midnight, Sakura, and Matrix reader themes, on top of Dark and Sepia.",
  },
  {
    icon: BarChart3,
    label: "Reading Stats",
    text: "Total reading time, streak record, favourite genre, and more.",
  },
  {
    icon: Tag,
    label: "Custom Tagline",
    text: "A one-line tagline under your handle, in Platinum color.",
  },
  {
    icon: Crown,
    label: "Platinum Badge",
    text: "A ✦ badge across chat, comments and your profile.",
  },
];

/** Cinematic dark showcase of the six core Platinum perks. */
export default function PlatinumSpotlight() {
  return (
    <section className="relative overflow-hidden bg-bg2 px-4 py-20 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #9ecfef, transparent 40%), radial-gradient(circle at 80% 80%, #d4a843, transparent 40%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <p className="font-syne text-xs font-bold uppercase tracking-[0.2em] text-plat2">Platinum</p>
          <h2 className="mt-2 font-cinzel text-2xl text-text sm:text-3xl">
            Everything unlocked. Nothing in the way.
          </h2>
          <p className="mx-auto mt-3 max-w-lg font-noto text-sm text-muted">
            Access African original manga and prose stories, including all premium chapters — no
            ads, no ad-watches, no coin spends, ever.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PERKS.map((perk) => (
            <div key={perk.label} className="glass rounded-2xl p-6">
              <perk.icon className="h-6 w-6 text-plat2" />
              <p className="mt-3 font-syne text-sm font-semibold text-text">{perk.label}</p>
              <p className="mt-1.5 font-noto text-xs text-muted">{perk.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
