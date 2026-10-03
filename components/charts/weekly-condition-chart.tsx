"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Param = { parameter: string; alarm: number; trip: number; direction: "rising" | "falling" };
type Point = { t: number; week: number; healthStatus: string; remark: string | null } & Record<string, unknown>;

const STATUS_COLOR: Record<string, string> = { NORMAL: "#3ab54a", ALARM: "#f2994a", TRIP: "#e4572e" };
const fmtD = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

/** Scale 1 — 26 weekly readings, one panel per monitored parameter (data-driven; count and names come from the record). */
export function WeeklyConditionChart({
  points,
  parameters,
  hourlyWindow,
  failureDate,
}: {
  points: Point[];
  parameters: Param[];
  hourlyWindow: { start: number; end: number } | null;
  failureDate: number | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {parameters.map((p) => (
        <div key={p.parameter} className="rounded-md border border-card-border p-2">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-navy">{p.parameter}</span>
            <span className="text-muted-foreground">
              alarm {p.alarm} · trip {p.trip} {p.direction === "falling" ? "(low limit ↓)" : "(high limit ↑)"}
            </span>
          </div>
          <div className="h-36">
            <ResponsiveContainer>
              <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e9f2" />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtD} tick={{ fontSize: 9, fill: "#52627e" }} />
                <YAxis tick={{ fontSize: 9, fill: "#52627e" }} domain={["auto", "auto"]} />
                {hourlyWindow && (
                  <ReferenceArea x1={hourlyWindow.start} x2={hourlyWindow.end} fill="#4dc1da" fillOpacity={0.15} ifOverflow="extendDomain" />
                )}
                {failureDate && <ReferenceLine x={failureDate} stroke="#e4572e" strokeWidth={1.5} />}
                <ReferenceLine y={p.alarm} stroke="#f2994a" strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: "alarm", fontSize: 9, fill: "#a4520b", position: "insideTopLeft" }} />
                <ReferenceLine y={p.trip} stroke="#e4572e" strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: "trip", fontSize: 9, fill: "#e4572e", position: "insideTopLeft" }} />
                <Tooltip
                  labelFormatter={(t) => {
                    const pt = points.find((x) => x.t === t);
                    return `Week ${pt?.week} · ${fmtD(Number(t))} · ${pt?.healthStatus}${pt?.remark ? ` — ${pt.remark}` : ""}`;
                  }}
                  formatter={(v) => [Number(v).toFixed(2), p.parameter]}
                  contentStyle={{ fontSize: 11, borderColor: "#e1e9f2", maxWidth: 320, whiteSpace: "normal" }}
                />
                <Line
                  dataKey={p.parameter}
                  stroke="#24417b"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  dot={(props) => {
                    const { cx, cy, payload, index } = props as { cx: number; cy: number; payload: Point; index: number };
                    const status = payload.healthStatus;
                    // Shape + colour: circle NORMAL, square ALARM, triangle TRIP (not colour alone).
                    if (status === "TRIP")
                      return <path key={index} d={`M${cx},${cy - 5} L${cx + 5},${cy + 4} L${cx - 5},${cy + 4} Z`} fill={STATUS_COLOR.TRIP} />;
                    if (status === "ALARM") return <rect key={index} x={cx - 3} y={cy - 3} width={6} height={6} fill={STATUS_COLOR.ALARM} />;
                    return <circle key={index} cx={cx} cy={cy} r={2.5} fill={STATUS_COLOR.NORMAL} />;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
