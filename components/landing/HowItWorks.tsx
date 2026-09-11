import { BookOpen, Compass, MessageCircle, Sparkles } from "lucide-react";
import { SectionEyebrow } from "@/components/ui";
import Reveal from "./Reveal";

const STEPS = [
  {
    icon: Compass,
    title: "Discover",
    text: "Browse African original manga and prose stories across every genre, curated for African readers.",
  },
  {
    icon: BookOpen,
    title: "Read",
    text: "Dive into chapters in your language, free or with Platinum for the full library.",
  },
  {
    icon: MessageCircle,
    title: "Connect",
    text: "Chat with fellow readers and follow the creators behind your favorite series.",
  },
  {
    icon: Sparkles,
    title: "Support",
    text: "Every coin and Platinum subscription goes straight back to African creators.",
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-bg2 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <SectionEyebrow>How It Works</SectionEyebrow>
          <h2 className="mb-12 font-cinzel text-2xl text-text sm:text-3xl">
            From first page to fandom
          </h2>
        </Reveal>

        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <ol className="flex flex-col gap-8">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay/15 font-cinzel text-sm text-clay2">
                    {i + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <step.icon className="h-4 w-4 text-gold" />
                      <h3 className="font-syne text-base font-semibold text-text">{step.title}</h3>
                    </div>
                    <p className="mt-1 font-noto text-sm text-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mx-auto flex w-56 flex-col gap-3 rounded-[2.5rem] border-4 border-bg4 bg-bg3 p-3 shadow-2xl">
              <div className="h-4 w-16 self-center rounded-full bg-bg4" />
              <div className="kente-bar rounded-full" />
              <div className="aspect-[3/4] w-full rounded-2xl bg-gradient-to-br from-clay/40 via-gold/30 to-green/40" />
              <div className="h-2 w-3/4 rounded-full bg-bg4" />
              <div className="h-2 w-1/2 rounded-full bg-bg4" />
              <div className="mt-1 h-8 w-full rounded-full bg-clay/80" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
