"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export type HourlySignal = {
  name: string;
  description: string;
  parameter: string;
  unit: string;
  unitDeclared: string;
  unitMismatch: boolean;
  templateTag: boolean;
  dataQualityNote: string | null;
  baselineMean: number | null;
  baselineStd: number | null;
  sustainedZ: number | null;
  firstFlagAt: string | null;
  limits: { alarm: number; trip: number; source: string; direction: string } | null;
  limitsNote: string | null;
  isPrimary: boolean;
};

type Detector = {
  firstFlagAt: string | null;
  tripAt: string | null;
  leadTimeHours: number | null;
  baselineEnd: string;
  offWindows: { start: number; end: number }[];
  escalations: { severity: string; at: string; sustainedZ: number }[];
};

const fmtDT = (t: number) =>
  new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const fmtD = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

/** Scale 2 — 30 days hourly. Primary signal chosen by the detector from data; any other tag can be selected. */
export function HourlySignalChart({ points, signals, detector }: { points: Record<string, unknown>[]; signals: HourlySignal[]; detector: Detector | null }) {
  const [selected, setSelected] = useState(signals.find((s) => s.isPrimary)?.name ?? signals[0]?.name);
  const sig = signals.find((s) => s.name === selected)!;
  const start = points[0]?.t as number;
  const baselineEnd = detector ? Date.parse(detector.baselineEnd) : null;
  const flag = sig.firstFlagAt ? Date.parse(sig.firstFlagAt) : null;
  const band = sig.baselineMean != null && sig.baselineStd != null ? [sig.baselineMean - 3 * sig.baselineStd, sig.baselineMean + 3 * sig.baselineStd] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {signals.map((s) => (
          <button
            key={s.name}
            onClick={() => setSelected(s.name)}
            className={cn(
              "rounded-md border px-2 py-1 text-left text-xs transition-colors",
              s.name === selected ? "border-navy bg-navy text-white" : "border-card-border bg-white hover:border-cyan",
            )}
          >
            <span className="font-mono">{s.name}</span>
            {s.isPrimary && <span className={cn("ml-1 rounded px-1 text-[9px] font-bold uppercase", s.name === selected ? "bg-cyan text-navy-deep" : "bg-cyan/20 text-cyan-deep")}>primary</span>}
            {s.sustainedZ != null && <span className="ml-1 opacity-70">{s.sustainedZ >= 0 ? "+" : ""}{s.sustainedZ.toFixed(1)}σ</span>}
            {(s.unitMismatch || s.templateTag) && <span className="ml-1 text-[#e4572e]">⚠</span>}
          </button>
        ))}
      </div>

      <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold text-navy">
          {sig.description} <span className="font-normal text-muted-foreground">({sig.unit})</span>
        </span>
        {sig.baselineMean != null && (
          <span className="text-muted-foreground">
            baseline {sig.baselineMean.toFixed(2)} ± {sig.baselineStd!.toFixed(2)} (first 120 h) · ±3σ band shaded
          </span>
        )}
        <span className="text-muted-foreground">{sig.limits ? `alarm ${sig.limits.alarm} / trip ${sig.limits.trip} — ${sig.limitsNote}` : `No alarm/trip lines: ${sig.limitsNote}`}</span>
      </div>
      {sig.unitMismatch && (
        <div className="mb-1 rounded border border-sev-high/40 bg-sev-high/10 px-2 py-1 text-xs text-[#a4520b]">
          DQ-6: declared {sig.unitDeclared}, observed {sig.unit}. Values are shown in the observed unit and never compared against the declared span.
        </div>
      )}
      {sig.templateTag && (
        <div className="mb-1 rounded border border-sev-high/40 bg-sev-high/10 px-2 py-1 text-xs text-[#a4520b]">
          DQ-7: template tag on static equipment — not an equipment-health signal for this asset.
        </div>
      )}

      <div className="h-72">
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 16, right: 12, bottom: 0, left: -4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e9f2" />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtD} tick={{ fontSize: 10, fill: "#52627e" }} tickCount={10} />
            <YAxis tick={{ fontSize: 10, fill: "#52627e" }} domain={["auto", "auto"]} width={44} />
            {baselineEnd && <ReferenceArea x1={start} x2={baselineEnd} fill="#24417b" fillOpacity={0.05} label={{ value: "baseline (120 h)", fontSize: 9, fill: "#52627e", position: "insideTop" }} />}
            {detector?.offWindows.map((w) => (
              <ReferenceArea key={w.start} x1={w.start} x2={w.end} fill="#e4572e" fillOpacity={0.15} label={{ value: "OFF", fontSize: 9, fill: "#e4572e", position: "insideTop" }} />
            ))}
            {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="#8cc63e" fillOpacity={0.12} ifOverflow="extendDomain" />}
            {sig.baselineMean != null && <ReferenceLine y={sig.baselineMean} stroke="#3ab54a" strokeDasharray="2 2" />}
            {sig.limits && (
              <ReferenceLine y={sig.limits.alarm} stroke="#f2994a" strokeDasharray="6 3" ifOverflow="extendDomain" label={{ value: `alarm ${sig.limits.alarm}`, fontSize: 9, fill: "#a4520b", position: "insideTopRight" }} />
            )}
            {sig.limits && (
              <ReferenceLine y={sig.limits.trip} stroke="#e4572e" strokeDasharray="6 3" ifOverflow="extendDomain" label={{ value: `trip ${sig.limits.trip}`, fontSize: 9, fill: "#e4572e", position: "insideTopRight" }} />
            )}
            {flag && (
              <ReferenceLine
                x={flag}
                stroke="#1f8fae"
                strokeWidth={2}
                label={{
                  value: sig.isPrimary && detector?.leadTimeHours != null ? `▼ detector flag · ${detector.leadTimeHours} h before trip` : "▼ 3σ × 3 h",
                  fontSize: 10,
                  fill: "#1f8fae",
                  // keep the label inside the plot: flip to the left of the line when the flag is late in the window
                  position: flag - start > 0.6 * ((points[points.length - 1]?.t as number) - start) ? "insideTopRight" : "insideTopLeft",
                }}
              />
            )}
            <Tooltip
              labelFormatter={(t) => fmtDT(Number(t))}
              formatter={(v) => [`${Number(v).toFixed(3)} ${sig.unit}`, sig.name]}
              contentStyle={{ fontSize: 11, borderColor: "#e1e9f2" }}
            />
            <Line dataKey={sig.name} stroke="#24417b" strokeWidth={1.25} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {sig.isPrimary && detector && detector.escalations.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span>Severity escalation (sustained 3-h deviation):</span>
          {detector.escalations.map((e) => (
            <span key={e.at}>
              <span className="font-semibold text-navy">{e.severity}</span> at {fmtDT(Date.parse(e.at))} ({e.sustainedZ}σ)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
