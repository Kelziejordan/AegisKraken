import { ExecutionAdapter } from "./interface";
import { TradeIntent, ExecutionResult } from "../types/domain.types";

export interface PaperAccountSnapshot {
  cash: number;
  equity: number;
  realizedPnl: number;
  feesPaid: number;
  positions: Record<string, { quantity: number; averageCost: number; marketValue: number }>;
}

/**
 * Local-only paper execution. This adapter never calls an exchange order endpoint.
 * Prices are supplied by the market-data layer and fills include configurable
 * slippage and fees. PnL is accounting-based; it is never randomized.
 */
export class KrakenPaperAdapter implements ExecutionAdapter {
  private lastPrice = 0;
  private readonly takerFeeRate: number;
  private readonly slippageRate: number;
  private cash: number;
  private realizedPnl = 0;
  private feesPaid = 0;
  private positions: Record<string, { quantity: number; averageCost: number; entryFeesPerUnit: number }> = {};
  private trades: ExecutionResult[] = [];

  constructor(
    initialCapital = 10000,
    options: { takerFeeRate?: number; slippageRate?: number } = {}
  ) {
    if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
      throw new Error("initialCapital must be a positive finite number");
    }
    this.cash = initialCapital;
    this.takerFeeRate = options.takerFeeRate ?? 0.0026;
    this.slippageRate = options.slippageRate ?? 0.0005;
  }

  setLastPrice(price: number): void {
    if (Number.isFinite(price) && price > 0) this.lastPrice = price;
  }

  getLastPrice(): number {
    return this.lastPrice;
  }

  getPositionQuantity(symbol: string): number {
    return this.positions[symbol]?.quantity ?? 0;
  }

  getTradeHistory(): ExecutionResult[] {
    return [...this.trades];
  }

  getAccountSnapshot(): PaperAccountSnapshot {
    const positions: PaperAccountSnapshot["positions"] = {};
    let marketValue = 0;
    for (const [symbol, position] of Object.entries(this.positions)) {
      const value = position.quantity * (symbol === "XBTUSD" ? this.lastPrice : this.lastPrice);
      positions[symbol] = {
        quantity: position.quantity,
        averageCost: position.averageCost,
        marketValue: value,
      };
      marketValue += value;
    }
    return {
      cash: this.cash,
      equity: this.cash + marketValue,
      realizedPnl: this.realizedPnl,
      feesPaid: this.feesPaid,
      positions,
    };
  }

  async execute(intent: TradeIntent): Promise<ExecutionResult> {
    const reject = (error: string): ExecutionResult => ({
      symbol: intent.symbol,
      side: intent.side,
      requestedNotional: intent.notional,
      filledNotional: 0,
      avgPrice: null,
      status: "REJECTED",
      error,
      timestamp: Date.now(),
    });

    if (this.lastPrice <= 0) return reject("No valid market price");
    if (!Number.isFinite(intent.notional) || intent.notional <= 0) {
      return reject("Notional must be a positive finite number");
    }

    const existing = this.positions[intent.symbol] ?? {
      quantity: 0,
      averageCost: 0,
      entryFeesPerUnit: 0,
    };
    const fillPrice = this.lastPrice * (intent.side === "BUY" ? 1 + this.slippageRate : 1 - this.slippageRate);
    let quantity = intent.notional / fillPrice;

    if (intent.side === "SELL") {
      if (existing.quantity <= 0) return reject("No position to sell");
      const estimatedPositionValue = existing.quantity * fillPrice;
      if (intent.notional >= estimatedPositionValue * 0.999) {
        quantity = existing.quantity;
      } else {
        quantity = Math.min(quantity, existing.quantity);
      }
    }

    const grossNotional = quantity * fillPrice;
    const fee = grossNotional * this.takerFeeRate;
    let tradePnl = 0;

    if (intent.side === "BUY") {
      const totalDebit = grossNotional + fee;
      if (totalDebit > this.cash) return reject("Insufficient paper cash");
      const oldCost = existing.quantity * existing.averageCost;
      const newQuantity = existing.quantity + quantity;
      this.cash -= totalDebit;
      this.feesPaid += fee;
      this.positions[intent.symbol] = {
        quantity: newQuantity,
        averageCost: (oldCost + totalDebit) / newQuantity,
        entryFeesPerUnit: 0,
      };
    } else {
      const costBasis = quantity * existing.averageCost;
      const netProceeds = grossNotional - fee;
      tradePnl = netProceeds - costBasis;
      this.cash += netProceeds;
      this.realizedPnl += tradePnl;
      this.feesPaid += fee;
      const remaining = existing.quantity - quantity;
      if (remaining <= 1e-12) {
        delete this.positions[intent.symbol];
      } else {
        this.positions[intent.symbol] = { ...existing, quantity: remaining };
      }
    }

    const result: ExecutionResult = {
      symbol: intent.symbol,
      side: intent.side,
      requestedNotional: intent.notional,
      filledNotional: grossNotional,
      avgPrice: fillPrice,
      status: "FILLED",
      timestamp: Date.now(),
      pnl: intent.side === "SELL" ? tradePnl : 0,
    };
    this.trades.push(result);
    return result;
  }
}
