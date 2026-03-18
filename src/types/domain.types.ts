export type TradeSide = 'BUY' | 'SELL';

export interface TradeIntent {
  symbol: string;
  side: TradeSide;
  notional: number;
  timestamp: number;
  reason: string;
}

export interface ExecutionResult {
  symbol: string;
  side: TradeSide;
  requestedNotional: number;
  filledNotional: number;
  avgPrice: number | null;
  status: 'FILLED' | 'REJECTED';
  error?: string;
  timestamp: number;
  pnl?: number;
}
