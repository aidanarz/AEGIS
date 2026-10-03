"use client";

import { useRouter } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { monthKey: string; label: string; actual: number; potential: number; incidents: number; downtime: number };

/** FR-2.6 plant-wide loss trend by monthYear. Click a month → drill into its incidents (FR-2.4). */
export function LossTrendChart({ data, qs }: { data: Point[]; qs: string }) {
  const router = useRouter();
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={(e) => {
            const idx = typeof e?.activeTooltipIndex === "number" ? e.activeTooltipIndex : Number(e?.activeTooltipIndex);
            const p = Number.isFinite(idx) ? data[idx] : undefined;
            if (p) router.push(`/incidents?${qs}&month=${p.monthKey}`);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e9f2" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#52627e" }} interval={2} />
          <YAxis yAxisId="loss" tick={{ fontSize: 10, fill: "#52627e" }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}M`} width={48} />
          <YAxis yAxisId="n" orientation="right" tick={{ fontSize: 10, fill: "#52627e" }} width={28} />
          <Tooltip
            formatter={(v, name) => (name === "Incidents" ? [v, name] : [`$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`, name])}
            contentStyle={{ fontSize: 12, borderColor: "#e1e9f2" }}
            cursor={{ fill: "rgba(77,193,218,0.12)" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="loss" dataKey="actual" name="Actual loss" stackId="l" fill="#24417b" cursor="pointer" isAnimationActive={false} />
          <Bar yAxisId="loss" dataKey="potential" name="Potential loss" stackId="l" fill="#4dc1da" cursor="pointer" isAnimationActive={false} />
          <Line yAxisId="n" dataKey="incidents" name="Incidents" stroke="#8cc63e" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
