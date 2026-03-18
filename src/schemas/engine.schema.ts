import { z } from 'zod';

export const TradeSchema = z.object({
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  requestedNotional: z.number(),
  filledNotional: z.number(),
  avgPrice: z.number().nullable(),
  status: z.enum(['FILLED', 'REJECTED']),
  error: z.string().optional(),
  timestamp: z.number(),
  pnl: z.number().optional(),
});

export const EngineStateSchema = z.object({
  connected: z.boolean(),
  lastPrice: z.number().nullable(),
  equity: z.number(),
  pnlSeries: z.array(z.object({
    t: z.number(),
    pnl: z.number(),
  })),
  regime: z.string(),
  identity: z.object({
    aggression: z.number(),
    caution: z.number(),
    exploration: z.number(),
  }),
  identitySeries: z.array(z.object({
    t: z.number(),
    aggression: z.number(),
    caution: z.number(),
    exploration: z.number(),
  })).optional(),
  identityEvent: z.object({
    timestamp: z.number(),
    message: z.string(),
  }).nullable().optional(),
  trades: z.array(TradeSchema),
  status: z.string(),
});

export type Trade = z.infer<typeof TradeSchema>;
export type EngineState = z.infer<typeof EngineStateSchema>;
