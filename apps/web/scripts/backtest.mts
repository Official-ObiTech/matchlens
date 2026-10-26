/**
 * Walk-forward backtest on real historical results.
 *
 *   npm run backtest -- --competition 39 --seasons 2022,2023 --test-from 2023-08-01
 *
 * Uses FOOTBALL_DATA_PROVIDER / FOOTBALL_API_KEY from apps/web/.env.local.
 * Costs one API request per season. Prints validation and held-out test
 * metrics; nothing is written to the database.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { MARKET_LABEL, pct, runBacktest, type PerformanceSummary } from "@fpp/core";
import { createProvider, toHistorical } from "@fpp/core/providers";
import type { ProviderId } from "@fpp/core";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { values } = parseArgs({
  options: {
    competition: { type: "string", default: "39" },
    seasons: { type: "string" },
    "test-from": { type: "string" },
    warmup: { type: "string", default: "100" },
  },
});

const provider = (process.env.FOOTBALL_DATA_PROVIDER ?? "api_football") as ProviderId;
const apiKey = process.env.FOOTBALL_API_KEY;
if (!apiKey) {
  console.error("FOOTBALL_API_KEY is not set (apps/web/.env.local).");
  process.exit(1);
}
if (!values.seasons) {
  console.error("Pass --seasons, e.g. --seasons 2022,2023");
  process.exit(1);
}

const p = createProvider(provider, { apiKey, timeoutMs: 30_000 });
const seasons = values.seasons.split(",").map(Number);
const fixtures = [];
for (const s of seasons) {
  process.stdout.write(`Fetching ${provider} competition ${values.competition} season ${s}… `);
  const f = await p.getSeasonFixtures(values.competition!, s);
  console.log(`${f.length} fixtures`);
  fixtures.push(...f);
}
const history = toHistorical(fixtures);
console.log(`${history.length} finished matches with full-time scores.\n`);

const report = runBacktest(history, { warmupMatches: Number(values.warmup), testFrom: values["test-from"] });

const line = (name: string, s: PerformanceSummary | null) => {
  if (!s) return;
  const ci = s.winRateInterval ? ` (95% CI ${pct(s.winRateInterval[0], 1)}–${pct(s.winRateInterval[1], 1)})` : "";
  console.log(
    `${name.padEnd(12)} picks ${String(s.settled).padStart(4)}  won ${String(s.won).padStart(4)}  win rate ${pct(s.winRate, 1).padStart(6)}${ci}  avg est. ${pct(s.meanPredicted, 1)}  Brier ${s.brier?.toFixed(4) ?? "–"}`,
  );
};

console.log(`Evaluated matches: ${report.evaluatedMatches}, abstentions: ${report.abstentions}`, report.abstentionReasons);
console.log(`1X2 multiclass Brier over all priced matches: ${report.outcome1x2Brier?.toFixed(4) ?? "–"} (uniform guess = 0.6667)\n`);
line("Validation", report.validation);
line("Test", report.test);
console.log("\nBy market:");
for (const m of report.byMarket) line(MARKET_LABEL[m.key] ?? m.key, m.summary);
console.log("\nBy estimated probability:");
for (const b of report.byProbability) line(b.key, b.summary);
console.log("\nA high win rate on a small or in-sample period is not evidence of future performance.");
