import { strict as assert } from "node:assert";
import { test } from "node:test";
import { KrakenPaperAdapter } from "./krakenPaper";

test("rejects orders until a valid market price is available", async () => {
  const paper = new KrakenPaperAdapter(10000);
  const result = await paper.execute({
    symbol: "XBTUSD", side: "BUY", notional: 100, timestamp: 1, reason: "test",
  });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.error, "No valid market price");
});

test("buy debits notional plus fee and never invents profit", async () => {
  const paper = new KrakenPaperAdapter(10000, { takerFeeRate: 0.0026, slippageRate: 0 });
  paper.setLastPrice(100);
  const result = await paper.execute({
    symbol: "XBTUSD", side: "BUY", notional: 1000, timestamp: 1, reason: "test buy",
  });
  assert.equal(result.status, "FILLED");
  assert.equal(result.pnl, 0);
  assert.ok(Math.abs(paper.getAccountSnapshot().cash - 8997.4) < 1e-8);
  assert.ok(paper.getPositionQuantity("XBTUSD") > 0);
});

test("sell realizes PnL from fill price and recorded cost basis", async () => {
  const paper = new KrakenPaperAdapter(10000, { takerFeeRate: 0.0026, slippageRate: 0 });
  paper.setLastPrice(100);
  await paper.execute({
    symbol: "XBTUSD", side: "BUY", notional: 1000, timestamp: 1, reason: "test buy",
  });
  const quantity = paper.getPositionQuantity("XBTUSD");
  paper.setLastPrice(110);
  const result = await paper.execute({
    symbol: "XBTUSD", side: "SELL", notional: quantity * 110, timestamp: 2, reason: "test exit",
  });
  assert.equal(result.status, "FILLED");
  assert.ok((result.pnl ?? 0) > 0);
  assert.equal(paper.getPositionQuantity("XBTUSD"), 0);
  assert.ok(paper.getAccountSnapshot().realizedPnl > 0);
});

test("rejects a buy that exceeds available paper cash", async () => {
  const paper = new KrakenPaperAdapter(100);
  paper.setLastPrice(100);
  const result = await paper.execute({
    symbol: "XBTUSD", side: "BUY", notional: 100, timestamp: 1, reason: "overspend",
  });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.error, "Insufficient paper cash");
});
