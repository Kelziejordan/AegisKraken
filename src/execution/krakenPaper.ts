// /src/execution/krakenPaper.ts
import { ExecutionAdapter } from "./interface";
import { TradeIntent, ExecutionResult } from "../types/domain.types";

export class KrakenPaperAdapter implements ExecutionAdapter {
  private lastPrice: number = 0;
  private readonly TAKER_FEE = 0.0026; // 0.26% Kraken Pro standard fee

  private trades: ExecutionResult[] = [];

  setLastPrice(price: number): void {
    this.lastPrice = price;
  }

  getLastPrice(): number {
    return this.lastPrice;
  }

  getTradeHistory(): ExecutionResult[] {
    return this.trades;
  }

  async execute(intent: TradeIntent): Promise<ExecutionResult> {
    if (this.lastPrice <= 0) return {
       symbol: intent.symbol, side: intent.side, requestedNotional: intent.notional,
       filledNotional: 0, avgPrice: null, status: "REJECTED", error: "No Price", timestamp: Date.now()
    };

    // Calculate realistic fill: Notional minus Kraken's fee
    const feeImpact = intent.notional * this.TAKER_FEE;
    const actualFilled = intent.notional - feeImpact;

    const result: ExecutionResult = {
      symbol: intent.symbol,
      side: intent.side,
      requestedNotional: intent.notional,
      filledNotional: actualFilled,
      avgPrice: this.lastPrice,
      status: "FILLED",
      timestamp: Date.now(),
      pnl: actualFilled * (Math.random() * 0.03 - 0.01) // Simulate -1% to +2% PnL
    };

    this.trades.push(result);
    return result;
  }
}
