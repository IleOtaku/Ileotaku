import type { DailyRevenuePoint } from "@/lib/admin";

export interface RevenueBarChartProps {
  data: DailyRevenuePoint[];
}

/** 7-day stacked revenue chart, built entirely from CSS bars (heights as % of the week's max
 * day total) — no charting library. Each day shows a clay segment (coin sales) stacked under
 * a gold segment (Platinum subscriptions). */
export default function RevenueBarChart({ data }: RevenueBarChartProps) {
  const dailyTotals = data.map((d) => d.coinsNGN + d.platinumNGN);
  const max = Math.max(1, ...dailyTotals);

  return (
    <div>
      <div className="flex items-end gap-3" style={{ height: 160 }}>
        {data.map((point) => {
          const total = point.coinsNGN + point.platinumNGN;
          const totalPct = (total / max) * 100;
          const coinsPct = total > 0 ? (point.coinsNGN / total) * 100 : 0;
          const platPct = total > 0 ? (point.platinumNGN / total) * 100 : 0;
          const label = new Date(point.date).toLocaleDateString(undefined, { weekday: "short" });

          return (
            <div key={point.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 flex-col-reverse overflow-hidden rounded-t-md bg-bg3" style={{ height: "100%" }}>
                <div
                  className="w-full transition-all"
                  style={{ height: `${totalPct}%`, minHeight: total > 0 ? "4px" : 0 }}
                  title={`₦${total.toLocaleString()}`}
                >
                  <div className="flex h-full w-full flex-col-reverse">
                    <div className="w-full bg-clay" style={{ height: `${coinsPct}%` }} />
                    <div className="w-full bg-gold" style={{ height: `${platPct}%` }} />
                  </div>
                </div>
              </div>
              <span className="font-noto text-[10px] text-muted">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 font-noto text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-clay" /> Coin sales
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gold" /> Platinum subs
        </span>
      </div>
    </div>
  );
}
