import Link from "next/link";
import { BookOpen, Globe2, Sparkles, Users2 } from "lucide-react";

const FEATURES = [
  { icon: Globe2, text: "Read in Swahili, Yorùbá, isiZulu, Amharic and more" },
  { icon: Users2, text: "Support African creators directly, chapter by chapter" },
  { icon: Sparkles, text: "Go ad-free and unlock exclusive titles with Platinum" },
  { icon: BookOpen, text: "Fresh chapters drop every single week" },
];

const STATS = [
  { value: "2,400+", label: "Titles" },
  { value: "180+", label: "Creators" },
  { value: "54", label: "Countries" },
];

/** Split-screen auth shell: branded panel on the left (desktop), form content on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="kente-bar shrink-0" />

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-bg2 p-10 lg:flex lg:w-[45%] xl:w-[40%]">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 15%, #c4622d, transparent 40%), radial-gradient(circle at 85% 75%, #3d6b4f, transparent 45%)",
            }}
          />

          <div className="relative z-10">
            <Link href="/" className="font-cinzel text-2xl font-bold text-gold">
              ÍléOtaku
            </Link>
            <p className="mt-4 font-cinzel text-lg text-ivory/90">Born from the Motherland</p>

            <ul className="mt-10 flex flex-col gap-5">
              {FEATURES.map((feature) => (
                <li key={feature.text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay/15 text-clay2">
                    <feature.icon className="h-4 w-4" />
                  </span>
                  <span className="font-noto text-sm text-text/85">{feature.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 mt-10 grid grid-cols-3 gap-4 border-t border-bg4 pt-6">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <p className="font-cinzel text-xl text-gold">{stat.value}</p>
                <p className="font-noto text-xs text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
