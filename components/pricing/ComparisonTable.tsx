import { Check, X } from "lucide-react";

interface FeatureRow {
  label: string;
  free: string | boolean;
  platinum: string | boolean;
  coins: string | boolean;
}

const FEATURES: FeatureRow[] = [
  { label: "Free catalog access", free: true, platinum: true, coins: true },
  { label: "Ads", free: true, platinum: false, coins: true },
  { label: "Early chapter access", free: false, platinum: true, coins: false },
  { label: "HD page quality", free: false, platinum: true, coins: false },
  { label: "Offline downloads", free: false, platinum: true, coins: false },
  { label: "Custom reader themes", free: false, platinum: true, coins: false },
  { label: "Platinum badge", free: false, platinum: true, coins: false },
  {
    label: "Premium chapter unlocks",
    free: "Pay per chapter",
    platinum: "Included",
    coins: "Pay per chapter",
  },
  { label: "Support creators directly", free: false, platinum: true, coins: true },
  {
    label: "Monthly cost",
    free: "₦0",
    platinum: "₦6,000–7,500 (~$4–5)",
    coins: "Pay as you go",
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto h-4 w-4 text-green2" />
    ) : (
      <X className="mx-auto h-4 w-4 text-muted2" />
    );
  }
  return <span className="font-noto text-xs text-text">{value}</span>;
}

export default function ComparisonTable() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <h2 className="font-cinzel text-2xl text-text sm:text-3xl">Compare plans</h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-bg4">
          <table className="w-full min-w-[560px] border-collapse text-center">
            <thead>
              <tr className="border-b border-bg4 bg-bg2">
                <th className="p-4 text-left font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                  Feature
                </th>
                <th className="p-4 font-syne text-sm font-semibold text-text">Free</th>
                <th className="bg-gold/10 p-4 font-syne text-sm font-bold text-gold">Platinum</th>
                <th className="p-4 font-syne text-sm font-semibold text-text">Coins</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? "bg-bg2/40" : "bg-transparent"}>
                  <td className="p-4 text-left font-noto text-xs text-muted">{row.label}</td>
                  <td className="p-4">
                    <Cell value={row.free} />
                  </td>
                  <td className="bg-gold/5 p-4">
                    <Cell value={row.platinum} />
                  </td>
                  <td className="p-4">
                    <Cell value={row.coins} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
