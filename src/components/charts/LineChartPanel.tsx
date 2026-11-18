"use client";

/**
 * ONE ANALYTICS LINE CHART (Recharts), styled with the product tokens only: transparent background, grid lines in
 * border-subtle, axis text in text-subtle at 11px, the first series in the admin accent, a second in text-muted, a
 * third in text-subtle (dashed), monotone curves, 1.5px lines, no dots except the active one on hover, and a small
 * tooltip on the surface colour. The colours come from CSS classes (.jx-chart in globals.css) that read the theme
 * tokens, so the light theme follows without a re-render. It receives already-aggregated points from the server page.
 * test/analytics.test.mjs pins that it imports only react and recharts.
 */
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartPoint = { day: string } & Record<string, number | string>;
export type ChartSeries = { key: string; label: string };

const SERIES_CLASS = ["jx-line-1", "jx-line-2", "jx-line-3"];

function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1] ?? m} ${Number(d)}`;
}

function fmt(v: number, decimals: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

type TipProps = { active?: boolean; label?: string | number; payload?: Array<{ dataKey?: unknown; value?: unknown; name?: unknown }>; series: ChartSeries[]; decimals: number };

function Tip({ active, label, payload, series, decimals }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] shadow-none">
      <p className="text-text-subtle">{typeof label === "string" ? shortDay(label) : String(label ?? "")}</p>
      {series.map((s, i) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return (
          <p key={s.key} className="flex items-center gap-1.5 text-text tabular-nums">
            <span className={`jx-swatch ${SERIES_CLASS[i]}`} aria-hidden="true" />
            <span className="text-text-muted">{s.label}</span> {fmt(Number(p?.value ?? 0), decimals)}
          </p>
        );
      })}
    </div>
  );
}

export function LineChartPanel({ title, total, points, series, decimals = 0, note }: { title: string; total: string; points: ChartPoint[]; series: ChartSeries[]; decimals?: number; note?: string }) {
  return (
    <section className="bg-surface border border-border rounded-xl p-3 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-2">
        <h2 className="text-sm text-text font-semibold">{title}</h2>
        <p className="text-sm text-text tabular-nums">{total}</p>
        {(series.length > 1 || note) && (
          <p className="basis-full flex flex-wrap gap-x-3 text-[11px] text-text-subtle">
            {series.length > 1 && series.map((s, i) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className={`jx-swatch ${SERIES_CLASS[i]}`} aria-hidden="true" />
                {s.label}
              </span>
            ))}
            {note && <span>{note}</span>}
          </p>
        )}
      </div>
      <div className="jx-chart h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 400, height: 220 }}>
          <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={decimals > 0} tickFormatter={(v: number) => fmt(v, decimals)} />
            <Tooltip content={(p) => <Tip {...(p as unknown as TipProps)} series={series} decimals={decimals} />} cursor={{ className: "jx-cursor" }} isAnimationActive={false} />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                className={SERIES_CLASS[i]}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, className: `jx-dot ${SERIES_CLASS[i]}` }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
