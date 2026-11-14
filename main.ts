// polymarket-faa-attribution-02 entry: persistence median with a
// per-market adaptive spread. Node 22, standard library only, offline,
// deterministic.
//
// Idea (from backtesting the six practice cases, recovering the actual
// future prices for p00-p04 from the overlapping next case): the house
// baseline uses one fixed spread (sigma 0.0025 per sqrt-minute) for every
// market, but the markets' real per-minute volatilities differ by an order
// of magnitude — most are quiet, a few jump. So each market gets its own
// sigma, the average of the realised volatilities of its 1-minute and
// its 5-minute price changes over the last 120 minutes (the average is
// less noisy than either alone), floored at 0.0005 and capped at 0.005.
// The median stays at the last price: mean reversion and drift were both
// tested and made the loss worse, so the median is plain persistence.
//
// Backtest (pinball loss, p00-p04, 104 market-cases): baseline 0.392518,
// this model 0.308710 — about 21% better, and better in every single case
// (p00 +15%, p01 +18%, p02 +17%, p03 +27%, p04 +31%). The spread adapts
// to each market's current volatility, so if the FAA final's markets are
// jumpier than the NVIDIA practice's, the realised vol rises and the
// spread widens on its own; the cap keeps it from blowing out.
//
// The practice is a different event (NVIDIA CEO) from the final (FAA
// attribution), so a practice score is no guide to the final — but the
// model is robust by construction (it never bets on a drift, and its spread
// follows the market's own recent volatility), and it must still beat the
// house model forecast as well as the baseline to take a prize.
//
// Entry format (program/v1): read every <id>.in in the input directory,
// write <id>.out: {"forecasts":[{"id","q"}]}, every market exactly once,
// `q` exactly horizon_minutes rows, row h-1 the forecast for minute at+h,
// each row five finite numbers in [0,1], non-decreasing, at most 1 MiB.
// Outside the grader: mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level, to 6 decimals. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** Minutes of recent history used to estimate a market's per-minute sigma. */
const VOL_WINDOW = 120;
/** The narrowest spread any market gets, per square-root minute. */
const SIGMA_FLOOR = 0.0005;
/** The widest spread any market gets, per square-root minute. */
const SIGMA_CAP = 0.005;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  quantiles: number[];
  markets: CaseMarket[];
}

/** x clamped to [0,1] and rounded to 6 decimals (0, never -0). */
const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/**
 * A market's per-minute sigma: the average of two estimates of the
 * standard deviation of its price changes over the last VOL_WINDOW
 * minutes — the 1-minute changes and the 5-minute changes scaled to
 * per-minute. Averaging the two makes the estimate less noisy than
 * either alone (the 1-minute read carries bid-ask bounce, the 5-minute
 * read fewer samples). Floored and capped. A market with fewer than
 * 2 prices takes the floor.
 */
function marketSigma(prices: number[]): number {
  const n = prices.length;
  if (n < 2) return SIGMA_FLOOR;
  const w = Math.min(VOL_WINDOW, n - 1);
  let s1 = 0;
  let s21 = 0;
  for (let i = n - w; i < n; i += 1) {
    const d = (prices[i] as number) - (prices[i - 1] as number);
    s1 += d;
    s21 += d * d;
  }
  const m1 = s1 / w;
  const sigma1 = Math.sqrt(Math.max(0, s21 / w - m1 * m1));
  let s5 = 0;
  let s25 = 0;
  let c5 = 0;
  for (let i = n - w; i < n; i += 5) {
    const d = (prices[i] as number) - (prices[Math.max(0, i - 5)] as number);
    s5 += d;
    s25 += d * d;
    c5 += 1;
  }
  const m5 = s5 / c5;
  const sigma5 = Math.sqrt(Math.max(0, s25 / c5 - m5 * m5)) / Math.sqrt(5);
  const sigma = (sigma1 + sigma5) / 2;
  return Math.min(SIGMA_CAP, Math.max(SIGMA_FLOOR, sigma));
}

/** One market's forecast: horizon rows of the five quantiles around its last price. */
function forecast(m: CaseMarket, horizon: number): number[][] {
  if (m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const x = m.prices[m.prices.length - 1] as number;
  const sigma = marketSigma(m.prices);
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) rows.push(Z.map((z) => price6(x + z * sigma * Math.sqrt(h))));
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.quantiles.length !== QUANTILES.length || c.quantiles.some((t, j) => t !== QUANTILES[j])) throw new Error(`${file} asks for quantiles ${JSON.stringify(c.quantiles)}, not ${JSON.stringify(QUANTILES)}`);
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, c.horizon_minutes) }));
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
}
