export type { TradeIntent, ExecutionResult } from "../types/domain.types";
import { TradeIntent, ExecutionResult } from "../types/domain.types";

export interface ExecutionAdapter {
  setLastPrice(price: number): void;
  execute(intent: TradeIntent): Promise<ExecutionResult>;
  getTradeHistory(): ExecutionResult[];
}
