// /src/schemas/kraken.schema.ts
// MANDATE 8: ZERO-TRUST DATA BOUNDARIES
import { z } from "zod";

/**
 * Kraken OHLC Response Structure:
 * [0] time, [1] open, [2] high, [3] low, [4] close, [5] vwap, [6] volume, [7] count
 */
export const KrakenOHLCSchema = z.object({
  error: z.array(z.string()),
  result: z.record(
    z.string(), 
    z.union([z.array(z.array(z.union([z.number(), z.string()]))), z.number()])
  )
}).transform((data) => {
  // We look for the key that isn't "last" (e.g., "XXBTZUSD")
  const pairKey = Object.keys(data.result).find(key => key !== 'last');
  if (!pairKey) return [];

  const klines = data.result[pairKey] as Array<Array<string | number>>;
  
  return klines.map((k) => ({
    close: Number(k[4]), // Index 4 is the closing price
  })).filter((p) => Number.isFinite(p.close));
});

export type ValidatedPriceBar = { close: number };
