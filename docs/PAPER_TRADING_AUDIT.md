# Paper-trading audit — initial findings

Date: 2026-10-18
Scope: AegisKraken paper execution path, reviewed against the current `main` branch.

## Findings

1. `src/domains/trading/marketFeed.ts` reads public Kraken XBT/USD OHLC data. This is a real public market-data source, but the engine currently uses the latest returned candle close as its price input; freshness and candle-completion checks remain necessary.
2. `src/execution/krakenPaper.ts` previously generated each trade's PnL with `Math.random()`. That made reported trade profitability synthetic and invalid as evidence of strategy performance.
3. The server previously derived PnL from `filledNotional - requestedNotional`, which mostly reflected the simulated fee deduction rather than market profit or loss.
4. The strategy previously generated BUY orders on bullish signals but had no corresponding bearish exit path.
5. The app stores memory and identity in SQLite, but paper-account cash, inventory, average cost, and trade ledger were held only in memory. Restart-safe account persistence is not yet implemented.
6. The existing regime forecast is a fixed transition table, not a probability model learned from historical market outcomes. Identity drift is rule-driven and must not be described as validated learning.
7. The root package declares a `dev` command using `tsx`, but `tsx` is not listed in the root package dependencies. The new test command uses the existing `ts-node` dependency; the command still needs execution in a clean environment.

## Changes proposed on this branch

- Replace randomized PnL with explicit paper-account cash, inventory, cost-basis, fee, and slippage accounting.
- Mark open positions to the latest market price for equity reporting.
- Add a bearish exit path that liquidates the held XBT/USD position in paper mode.
- Add focused unit tests for missing-price rejection, fee accounting, realized PnL, and insufficient cash.
- Keep all orders in the local paper adapter; no live order endpoint or credentials are used by this change.

## Not yet proven

- Tests have been authored but have not yet been executed in a clean CI environment.
- Paper account state and trade history do not yet survive process restart.
- The market feed does not yet verify candle freshness or exclude the currently open candle.
- No historical replay, out-of-sample validation, profitability, or learning improvement has been demonstrated.
- No continuous paper-trading session has been started or evidenced.

## Acceptance gates before calling this usable

1. Clean install, type-check/build, and unit tests pass.
2. Account and trade ledger persist and recover across restart without duplicate actions.
3. Feed staleness, missing bars, API errors, and overlapping engine ticks fail closed.
4. Paper fills and PnL reconcile from recorded prices, fees, slippage, positions, and cash.
5. A bounded paper session produces a retained evidence report with decision reasons, all fills, equity curve, net PnL, drawdown, and configuration hash.
6. No live-trading capability is enabled as part of this milestone.
