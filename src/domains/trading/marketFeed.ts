// /src/domains/trading/marketFeed.ts
// MANDATE 2: SIGNAL-DRIVEN ASYNCHRONY
import { RemoteData } from "../../types/remote-data";
import { KrakenOHLCSchema, ValidatedPriceBar } from "../../schemas/kraken.schema";
import { logger } from "../../utils/logger";

export async function fetchMarketPrices(signal: AbortSignal): Promise<RemoteData<ValidatedPriceBar[]>> {
  // Kraken Pro API: BTC/USD, 1-minute interval
  const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1";

  try {
    const res = await fetch(url, { 
      signal,
      headers: { 'Accept': 'application/json' }
    });
    
    if (!res.ok) {
      return RemoteData.error(new Error(`Kraken API Error: ${res.status}`));
    }

    const rawData = await res.json();
    const parsed = KrakenOHLCSchema.safeParse(rawData);
    
    if (!parsed.success) {
      logger.error("Kraken Schema Validation Failed", { errors: parsed.error.format() });
      return RemoteData.error(new Error("Invalid Kraken Response"));
    }

    return RemoteData.success(parsed.data);
  } catch (e: any) {
    if (e.name === 'AbortError') return RemoteData.error(new Error("Timeout"));
    return RemoteData.error(e);
  }
}
