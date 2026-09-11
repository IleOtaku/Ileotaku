const FEATURES = [
  "African original manga, manhwa and prose",
  "Read in 30+ African languages",
  "180+ creators earning directly from readers",
  "New chapters drop every week",
  "Ad-free reading with Platinum",
  "Built for Africa, read everywhere",
];

/** Continuous scrolling strip of platform highlights — pure CSS, no client JS required. */
export default function Marquee() {
  const items = [...FEATURES, ...FEATURES];

  return (
    <div className="overflow-hidden border-y border-bg4 bg-bg2 py-3">
      <div className="marquee-track flex w-max gap-10 whitespace-nowrap">
        {items.map((text, i) => (
          <span key={i} className="flex items-center gap-3 font-syne text-sm text-muted">
            <span className="h-1 w-1 rounded-full bg-gold" />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
