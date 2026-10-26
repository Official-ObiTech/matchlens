import type { MarketProbability, Selection } from "../types";
import { scoreMatrix, sumWhere } from "./poisson";

export const GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5] as const;
export const TEAM_GOAL_LINES = [0.5, 1.5, 2.5] as const;
export const FIRST_HALF_LINES = [0.5, 1.5] as const;

export interface MarketInputs {
  lambdaHome: number;
  lambdaAway: number;
  rho: number;
  /** Share of goals scored before half-time in this league; null = market unsupported. */
  firstHalfShare: number | null;
  homeName: string;
  awayName: string;
}

export function selectionKey(s: Selection): string {
  return s.line == null ? `${s.market}:${s.outcome}` : `${s.market}:${s.outcome}:${s.line}`;
}

export function selectionLabel(s: Selection, homeName = "Home", awayName = "Away"): string {
  switch (s.market) {
    case "1X2":
      return s.outcome === "HOME" ? `${homeName} to win` : s.outcome === "AWAY" ? `${awayName} to win` : "Draw";
    case "DOUBLE_CHANCE":
      return s.outcome === "1X"
        ? `${homeName} or draw`
        : s.outcome === "X2"
          ? `${awayName} or draw`
          : `${homeName} or ${awayName}`;
    case "DRAW_NO_BET":
      return `${s.outcome === "HOME" ? homeName : awayName} (draw no bet)`;
    case "TOTAL_GOALS":
      return `${s.outcome === "OVER" ? "Over" : "Under"} ${s.line} goals`;
    case "BTTS":
      return s.outcome === "YES" ? "Both teams to score" : "Both teams to score — No";
    case "HOME_TEAM_GOALS":
      return `${homeName} ${s.outcome === "OVER" ? "over" : "under"} ${s.line} goals`;
    case "AWAY_TEAM_GOALS":
      return `${awayName} ${s.outcome === "OVER" ? "over" : "under"} ${s.line} goals`;
    case "FIRST_HALF_GOALS":
      return `First half ${s.outcome === "OVER" ? "over" : "under"} ${s.line} goals`;
    case "CORRECT_SCORE":
      return `Correct score ${s.outcome}`;
  }
}

/**
 * Derive every supported market from the joint score distribution. All
 * probabilities come from the same matrix so they are mutually consistent.
 */
export function computeMarkets(inp: MarketInputs): MarketProbability[] {
  const m = scoreMatrix(inp.lambdaHome, inp.lambdaAway, inp.rho);
  const out: MarketProbability[] = [];
  const push = (sel: Selection, probability: number, pushProbability?: number) =>
    out.push({
      ...sel,
      probability: clamp01(probability),
      ...(pushProbability != null ? { pushProbability: clamp01(pushProbability) } : {}),
      label: selectionLabel(sel, inp.homeName, inp.awayName),
    });

  const pH = sumWhere(m, (h, a) => h > a);
  const pD = sumWhere(m, (h, a) => h === a);
  const pA = sumWhere(m, (h, a) => h < a);
  push({ market: "1X2", outcome: "HOME" }, pH);
  push({ market: "1X2", outcome: "DRAW" }, pD);
  push({ market: "1X2", outcome: "AWAY" }, pA);

  push({ market: "DOUBLE_CHANCE", outcome: "1X" }, pH + pD);
  push({ market: "DOUBLE_CHANCE", outcome: "X2" }, pA + pD);
  push({ market: "DOUBLE_CHANCE", outcome: "12" }, pH + pA);

  // DNB: win prob is unconditional; a draw voids the selection.
  push({ market: "DRAW_NO_BET", outcome: "HOME" }, pH, pD);
  push({ market: "DRAW_NO_BET", outcome: "AWAY" }, pA, pD);

  for (const line of GOAL_LINES) {
    const over = sumWhere(m, (h, a) => h + a > line);
    push({ market: "TOTAL_GOALS", outcome: "OVER", line }, over);
    push({ market: "TOTAL_GOALS", outcome: "UNDER", line }, 1 - over);
  }

  const btts = sumWhere(m, (h, a) => h > 0 && a > 0);
  push({ market: "BTTS", outcome: "YES" }, btts);
  push({ market: "BTTS", outcome: "NO" }, 1 - btts);

  for (const line of TEAM_GOAL_LINES) {
    const ho = sumWhere(m, (h) => h > line);
    const ao = sumWhere(m, (_h, a) => a > line);
    push({ market: "HOME_TEAM_GOALS", outcome: "OVER", line }, ho);
    push({ market: "HOME_TEAM_GOALS", outcome: "UNDER", line }, 1 - ho);
    push({ market: "AWAY_TEAM_GOALS", outcome: "OVER", line }, ao);
    push({ market: "AWAY_TEAM_GOALS", outcome: "UNDER", line }, 1 - ao);
  }

  // First-half goals only when the league's observed first-half goal share is known.
  if (inp.firstHalfShare != null && inp.firstHalfShare > 0 && inp.firstHalfShare < 1) {
    const fh = scoreMatrix(inp.lambdaHome * inp.firstHalfShare, inp.lambdaAway * inp.firstHalfShare, 0);
    for (const line of FIRST_HALF_LINES) {
      const over = sumWhere(fh, (h, a) => h + a > line);
      push({ market: "FIRST_HALF_GOALS", outcome: "OVER", line }, over);
      push({ market: "FIRST_HALF_GOALS", outcome: "UNDER", line }, 1 - over);
    }
  }

  // Top correct scores (informational; never recommended — individually unlikely).
  const cells: { h: number; a: number; p: number }[] = [];
  for (let h = 0; h <= 5; h++) for (let a = 0; a <= 5; a++) cells.push({ h, a, p: m[h]![a]! });
  cells
    .sort((x, y) => y.p - x.p)
    .slice(0, 6)
    .forEach((c) => push({ market: "CORRECT_SCORE", outcome: `${c.h}-${c.a}` }, c.p));

  return out;
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}
