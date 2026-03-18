// src/api/server.ts
import express from "express";
import next from "next";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { parse } from "url";
import Database from "better-sqlite3";

import { fetchMarketPrices } from "../domains/trading/marketFeed";
import { KrakenPaperAdapter } from "../execution/krakenPaper";
import { logger } from "../utils/logger";
import { TradeIntent, ExecutionResult } from "../execution/interface";

dotenv.config();

/* ----------------------------- Configuration ----------------------------- */
const CONFIG = {
  PORT: Number(process.env.PORT || 3000),
  TICK: Number(process.env.ENGINE_TICK_MS || 5000),
  CAPITAL: Number(process.env.INITIAL_CAPITAL || 10000),
  DB_PATH: process.env.DB_PATH || "./data/core.db",
};

/* ------------------------------- Persistence ----------------------------- */
// Ensure data directory exists
const dbDir = path.dirname(CONFIG.DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(CONFIG.DB_PATH);

// Create tables if missing
db.exec(`
CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regime TEXT,
  decision TEXT,
  pnl REAL,
  timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS identity (
  id INTEGER PRIMARY KEY CHECK(id=1),
  aggression REAL,
  caution REAL,
  exploration REAL,
  explorationRate REAL
);

CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  createdAt INTEGER,
  hypothesis TEXT,
  parameterChanges TEXT,
  durationTicks INTEGER,
  status TEXT,
  startTick INTEGER,
  endTick INTEGER,
  resultScore REAL
);
`);

// DB helpers
const saveMemory = (r: string, d: string, p: number) =>
  db.prepare(`INSERT INTO memory(regime,decision,pnl,timestamp) VALUES(?,?,?,?)`).run(r, d, p, Date.now());

const getMemory = (limit = 50) =>
  db.prepare(`SELECT * FROM memory ORDER BY id DESC LIMIT ?`).all(limit);

const saveIdentity = (a: number, c: number, e: number, rate: number) =>
  db
    .prepare(
      `INSERT INTO identity VALUES(1,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         aggression=excluded.aggression,
         caution=excluded.caution,
         exploration=excluded.exploration,
         explorationRate=excluded.explorationRate`
    )
    .run(a, c, e, rate);

const loadIdentity = () => db.prepare(`SELECT * FROM identity WHERE id=1`).get();

/* ------------------------------- Types ---------------------------------- */
type MarketRegime = "BULL" | "BEAR" | "CHOPPY" | "VOLATILE" | "UNKNOWN";
type Decision = "PROCEED" | "HOLD" | "VETO";

/* ------------------------------- Globals -------------------------------- */
let identity = {
  aggression: 0.5,
  caution: 0.5,
  exploration: 0.25,
};
let explorationRate = 0.25;

const storedIdentity = loadIdentity() as any;
if (storedIdentity) {
  identity.aggression = storedIdentity.aggression ?? identity.aggression;
  identity.caution = storedIdentity.caution ?? identity.caution;
  identity.exploration = storedIdentity.exploration ?? identity.exploration;
  explorationRate = storedIdentity.explorationRate ?? explorationRate;
}

let riskState = {
  equity: CONFIG.CAPITAL,
  maxDrawdown: 0,
  sessionPnL: 0,
  killSwitch: false,
};

let globalLastPrice: number | null = null;
let globalPnlSeries: { t: number; pnl: number }[] = [];
let globalMarketRegime: MarketRegime = "UNKNOWN";
let globalTradeHistory: ExecutionResult[] = [];
let globalStatus = "IDLE";
let globalIdentitySeries: { t: number; aggression: number; caution: number; exploration: number }[] = [];
let globalIdentityEvent: { timestamp: number; message: string } | null = null;

/* --------------------------- Execution Adapter --------------------------- */
const executionAdapter = new KrakenPaperAdapter();

/* --------------------------- Utility helpers ---------------------------- */
function computePositionSize(
  _riskState: typeof riskState,
  _notUsed?: any,
  _identity?: typeof identity,
  _regime?: MarketRegime
) {
  // Simple position sizing: small fraction of equity
  const fraction = Math.max(0.001, Math.min(0.02, identity.aggression * 0.02));
  return Math.max(1, Math.floor(riskState.equity * fraction));
}

function now() {
  return Date.now();
}

/* --------------------------- Perception / Forecast ----------------------- */
/**
 * perceive: simple moving average change classifier
 * returns MarketRegime
 */
function perceive(prices: { close: number }[]): MarketRegime {
  if (!prices || prices.length < 5) return "CHOPPY";
  const slice = prices.slice(-20);
  const closes = slice.map((p) => p.close);
  const avg = closes.reduce((s, v) => s + v, 0) / closes.length;
  const last = closes[closes.length - 1];
  const change = (last - avg) / avg;
  if (change < -0.01) return "BEAR";
  if (change > 0.01) return "BULL";
  return "CHOPPY";
}

/**
 * forecast: returns a simple prediction object
 */
function forecast(regime: MarketRegime): { next: MarketRegime; probability: number } {
  const matrix: Record<MarketRegime, Record<MarketRegime, number>> = {
    BULL: { BULL: 0.6, CHOPPY: 0.4, BEAR: 0, VOLATILE: 0, UNKNOWN: 0 },
    BEAR: { BEAR: 0.6, CHOPPY: 0.4, BULL: 0, VOLATILE: 0, UNKNOWN: 0 },
    CHOPPY: { CHOPPY: 0.5, BULL: 0.25, BEAR: 0.25, VOLATILE: 0, UNKNOWN: 0 },
    VOLATILE: { VOLATILE: 0.6, CHOPPY: 0.4, BULL: 0, BEAR: 0, UNKNOWN: 0 },
    UNKNOWN: { CHOPPY: 1, BULL: 0, BEAR: 0, VOLATILE: 0, UNKNOWN: 0 },
  };
  const row = matrix[regime] ?? matrix.UNKNOWN;
  const entries = Object.entries(row).sort((a, b) => b[1] - a[1]);
  const [next, prob] = entries[0];
  return { next: next as MarketRegime, probability: prob };
}

/* ---------------------------- Engine tick -------------------------------- */
async function runEngineTick() {
  const controller = new AbortController();
  try {
    // fetchMarketPrices may return a RemoteData-like object; handle generically
    const rd = await fetchMarketPrices(controller.signal);
    // Accept both shapes: { ok: true, value } or { status: 'success', data } or { type: 'success', data }
    let prices: { close: number }[] | undefined;
    if (rd == null) {
      prices = undefined;
    } else if ((rd as any).ok && (rd as any).value) {
      prices = (rd as any).value;
    } else if ((rd as any).status === "success" && (rd as any).data) {
      prices = (rd as any).data;
    } else if ((rd as any).type === "success" && (rd as any).data) {
      prices = (rd as any).data;
    } else if (Array.isArray(rd)) {
      prices = rd as any;
    }

    if (!prices || prices.length === 0) {
      globalStatus = "NO_MARKET";
      logger.warn("Engine tick: no market data");
      return;
    }

    const lastPrice = prices[prices.length - 1].close;
    globalLastPrice = lastPrice;
    executionAdapter.setLastPrice(lastPrice);

    const regime = perceive(prices);
    const forecastResult = forecast(regime);
    globalMarketRegime = regime;

    // Simulate Identity Drift based on regime
    if (regime === "BULL") {
      identity.aggression = Math.min(1, identity.aggression + 0.02);
      identity.caution = Math.max(0, identity.caution - 0.01);
    } else if (regime === "BEAR") {
      identity.aggression = Math.max(0, identity.aggression - 0.02);
      identity.caution = Math.min(1, identity.caution + 0.02);
    } else if (regime === "VOLATILE") {
      identity.exploration = Math.min(1, identity.exploration + 0.02);
    }

    // Trigger identity drift event if threshold crossed
    if (identity.aggression > 0.8 && (!globalIdentityEvent || now() - globalIdentityEvent.timestamp > 60000)) {
      globalIdentityEvent = { timestamp: now(), message: "Aggression Critical: Bullish Drift" };
    } else if (identity.caution > 0.8 && (!globalIdentityEvent || now() - globalIdentityEvent.timestamp > 60000)) {
      globalIdentityEvent = { timestamp: now(), message: "Caution Critical: Bearish Drift" };
    } else if (identity.exploration > 0.8 && (!globalIdentityEvent || now() - globalIdentityEvent.timestamp > 60000)) {
      globalIdentityEvent = { timestamp: now(), message: "Exploration Critical: Volatile Drift" };
    }

    globalIdentitySeries.push({ t: now(), aggression: identity.aggression, caution: identity.caution, exploration: identity.exploration });
    if (globalIdentitySeries.length > 100) globalIdentitySeries.shift();

    // Decision logic (canonical Decision values)
    let decision: Decision = "HOLD";
    if (forecastResult.next === "BULL" && forecastResult.probability > 0.55 && identity.aggression > 0.4 && identity.caution < 0.8) {
      decision = "PROCEED";
    }
    if (riskState.killSwitch) decision = "VETO";

    // Execution
    let execResult: ExecutionResult | null = null;
    if (decision === "PROCEED") {
      const notional = computePositionSize(riskState, null, identity, regime);
      const intent: TradeIntent = {
        symbol: "XBTUSD",
        side: "BUY",
        notional,
        timestamp: now(),
        reason: `Argus Signal: ${regime}`,
      };
      execResult = await executionAdapter.execute(intent);
      if (execResult) globalTradeHistory.push(execResult);
    }

    // Update PnL series (consistent shape)
    const lastTrade = globalTradeHistory[globalTradeHistory.length - 1];
    const tickPnl = lastTrade ? (lastTrade.filledNotional - (lastTrade.requestedNotional ?? 0)) : 0;
    const prevCumulative = globalPnlSeries.length ? globalPnlSeries[globalPnlSeries.length - 1].pnl : 0;
    const cumulative = prevCumulative + tickPnl;
    globalPnlSeries.push({ t: now(), pnl: cumulative });
    if (globalPnlSeries.length > 500) globalPnlSeries.shift();

    // Persist memory and identity snapshot
    saveMemory(regime, decision, tickPnl);
    saveIdentity(identity.aggression, identity.caution, identity.exploration, explorationRate);

    // Update risk state (simple)
    riskState.sessionPnL = cumulative;
    riskState.equity = CONFIG.CAPITAL + cumulative;
    if (riskState.equity < CONFIG.CAPITAL * 0.5) riskState.killSwitch = true;

    globalStatus = decision === "PROCEED" ? "PROCEED" : "HOLD";
    logger.info("Engine tick", { regime, decision, lastPrice, equity: riskState.equity });
  } catch (err) {
    logger.error("runEngineTick error", err);
    globalStatus = "ERROR";
  } finally {
    controller.abort();
  }
}

/* --------------------------- Engine loop starter ------------------------- */
function startEngineLoop() {
  // initial tick immediately, then interval
  runEngineTick().catch((e) => logger.error("initial tick failed", e));
  setInterval(() => {
    runEngineTick().catch((e) => logger.error("tick failed", e));
  }, CONFIG.TICK);
}

/* ------------------------------- Web server ------------------------------ */
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const server = express();

  server.get("/api/state", (req, res) => {
    try {
      const state = {
        connected: globalLastPrice !== null,
        lastPrice: globalLastPrice,
        equity: riskState.equity,
        pnlSeries: globalPnlSeries.length ? globalPnlSeries : [{ t: now(), pnl: 0 }],
        regime: globalMarketRegime,
        identity: {
          aggression: identity.aggression,
          caution: identity.caution,
          exploration: identity.exploration,
        },
        identitySeries: globalIdentitySeries,
        identityEvent: globalIdentityEvent,
        trades: globalTradeHistory.slice(-50),
        status: globalStatus,
      };
      res.json(state);
    } catch (err) {
      logger.error("API /api/state error", err);
      res.status(500).json({
        connected: false,
        lastPrice: null,
        equity: CONFIG.CAPITAL,
        pnlSeries: [{ t: now(), pnl: 0 }],
        regime: "UNKNOWN",
        identity: { aggression: 0.5, caution: 0.5, exploration: 0.25 },
        identitySeries: [],
        identityEvent: null,
        trades: [],
        status: "ERROR",
      });
    }
  });

  // Next.js handler for everything else
  server.all(/.*/, (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const port = CONFIG.PORT || 3000;
  server.listen(port, "0.0.0.0", () => {
    logger.info(`Aegis Kraken Argus Engine running @ ${port}`);
    startEngineLoop();
  });
}).catch((err) => {
  logger.error("Next.js prepare error", err);
  process.exit(1);
});
