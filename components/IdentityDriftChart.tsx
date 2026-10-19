"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export function IdentityDriftChart({ snapshots }: { snapshots: any[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      <h2 className="font-bold uppercase tracking-tight text-zinc-400 mb-6">
        Identity Drift Over Time
      </h2>

      <div className="h-64 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={snapshots}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tickFormatter={() => ""} stroke="#52525b" tickLine={false} axisLine={false} />
            <YAxis domain={[0, 1]} stroke="#52525b" tickLine={false} axisLine={false} fontSize={10} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                borderColor: "#27272a",
                borderRadius: 8
              }}
              labelFormatter={(t) =>
                new Date(t as number).toLocaleTimeString()
              }
              formatter={(value, name, props) => {
                const numericValue = typeof value === "number" ? value : Number(value);
                const label = typeof name === "string" ? name : String(name ?? "");
                const event = props?.payload?.event;
                return [
                  Number.isFinite(numericValue) ? numericValue.toFixed(3) : String(value ?? ""),
                  event ? `${label} (${event})` : label
                ];
              }}
            />

            <Line
              type="monotone"
              dataKey="aggression"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="caution"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="exploration"
              stroke="#a855f7"
              strokeWidth={2}
              dot={false}
            />

            {snapshots.map((s, i) =>
              s.event ? (
                <line
                  key={i}
                  x1={s.t}
                  x2={s.t}
                  y1={0}
                  y2={1}
                  stroke={
                    s.event.includes("WIN")
                      ? "#10b981"
                      : s.event.includes("LOSS")
                      ? "#ef4444"
                      : "#facc15"
                  }
                  strokeWidth={1}
                  opacity={0.4}
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
