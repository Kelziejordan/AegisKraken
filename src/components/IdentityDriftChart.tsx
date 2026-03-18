import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';

interface IdentitySeriesPoint {
  t: number;
  aggression: number;
  caution: number;
  exploration: number;
}

interface IdentityEvent {
  timestamp: number;
  message: string;
}

interface IdentityDriftChartProps {
  data?: IdentitySeriesPoint[];
  event?: IdentityEvent | null;
}

export function IdentityDriftChart({ data = [], event }: IdentityDriftChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-zinc-600">
        <p className="text-xs font-mono uppercase tracking-widest">Awaiting Identity Data</p>
      </div>
    );
  }

  // Format data for chart
  const chartData = data.map((d, i) => ({
    ...d,
    name: i,
    timeLabel: new Date(d.t).toLocaleTimeString(),
  }));

  // Find the index of the event if it exists
  let eventIndex = -1;
  if (event && data.length > 0) {
    // Find closest data point
    const closest = data.reduce((prev, curr, i) => 
      Math.abs(curr.t - event.timestamp) < Math.abs(data[prev].t - event.timestamp) ? i : prev
    , 0);
    eventIndex = closest;
  }

  return (
    <div className="h-full w-full min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="#52525b" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false} 
            tick={false}
          />
          <YAxis 
            stroke="#52525b" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false} 
            domain={[0, 1]} 
            tickFormatter={(val) => val.toFixed(1)}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
            labelStyle={{ color: '#a1a1aa', fontSize: '10px', marginBottom: '4px' }}
            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.timeLabel || label}
          />
          <Line type="monotone" dataKey="aggression" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="caution" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="exploration" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
          
          {eventIndex !== -1 && (
            <ReferenceLine 
              x={eventIndex} 
              stroke="#ef4444" 
              strokeDasharray="3 3"
              label={{ position: 'top', value: event?.message, fill: '#ef4444', fontSize: 10 }} 
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
