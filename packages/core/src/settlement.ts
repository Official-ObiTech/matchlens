import type { Fixture, FixtureStatus, Score, Selection, SettlementOutcome } from "./types";

/** A postponed/suspended match that is not played within this window is voided. */
export const VOID_AFTER_HOURS = 72;

export interface SettlementInput {
  status: FixtureStatus;
  kickoffAt: string;
  regularTime: Score;
  halfTime: Score;
}

export interface SettlementDecision {
  outcome: SettlementOutcome;
  reason: string;
}

export function fixtureToSettlementInput(f: Fixture): SettlementInput {
  return { status: f.status, kickoffAt: f.kickoffAt, regularTime: f.regularTime, halfTime: f.halfTime };
}

/**
 * Settle one selection. All goal markets settle on regular time (90 minutes +
 * stoppage), extra time and penalties excluded. First-half markets settle on
 * the half-time score. Anything not yet decidable stays "pending".
 */
export function settleSelection(sel: Selection, f: SettlementInput, now = new Date()): SettlementDecision {
  switch (f.status) {
    case "cancelled":
    case "abandoned":
    case "awarded":
      return { outcome: "void", reason: `Match ${f.status}.` };
    case "postponed":
    case "suspended": {
      const hours = (now.getTime() - new Date(f.kickoffAt).getTime()) / 3_600_000;
      return hours > VOID_AFTER_HOURS
        ? { outcome: "void", reason: `Match ${f.status} and not completed within ${VOID_AFTER_HOURS}h.` }
        : { outcome: "pending", reason: `Match ${f.status}; waiting for rescheduling.` };
    }
    case "finished":
      break;
    default:
      return { outcome: "pending", reason: "Match not finished." };
  }

  const { home: h, away: a } = f.regularTime;
  if (h == null || a == null) return { outcome: "pending", reason: "Final score not yet available." };

  const result = (won: boolean): SettlementDecision => ({ outcome: won ? "won" : "lost", reason: `Final score ${h}-${a}.` });
  const line = sel.line ?? NaN;

  switch (sel.market) {
    case "1X2":
      if (sel.outcome === "HOME") return result(h > a);
      if (sel.outcome === "AWAY") return result(a > h);
      if (sel.outcome === "DRAW") return result(h === a);
      break;
    case "DOUBLE_CHANCE":
      if (sel.outcome === "1X") return result(h >= a);
      if (sel.outcome === "X2") return result(a >= h);
      if (sel.outcome === "12") return result(h !== a);
      break;
    case "DRAW_NO_BET":
      if (h === a) return { outcome: "void", reason: `Draw ${h}-${a}: draw no bet is void.` };
      if (sel.outcome === "HOME") return result(h > a);
      if (sel.outcome === "AWAY") return result(a > h);
      break;
    case "TOTAL_GOALS":
      return overUnder(sel.outcome, h + a, line, result);
    case "HOME_TEAM_GOALS":
      return overUnder(sel.outcome, h, line, result);
    case "AWAY_TEAM_GOALS":
      return overUnder(sel.outcome, a, line, result);
    case "BTTS":
      if (sel.outcome === "YES") return result(h > 0 && a > 0);
      if (sel.outcome === "NO") return result(!(h > 0 && a > 0));
      break;
    case "FIRST_HALF_GOALS": {
      const { home: hh, away: ha } = f.halfTime;
      if (hh == null || ha == null) return { outcome: "pending", reason: "Half-time score not available." };
      const r = overUnder(sel.outcome, hh + ha, line, (won) => ({ outcome: won ? "won" : "lost", reason: `Half-time score ${hh}-${ha}.` }));
      return r;
    }
    case "CORRECT_SCORE":
      return result(sel.outcome === `${h}-${a}`);
  }
  throw new Error(`Unsupported selection ${sel.market}:${sel.outcome}`);
}

function overUnder(
  outcome: string,
  goals: number,
  line: number,
  result: (won: boolean) => SettlementDecision,
): SettlementDecision {
  if (!Number.isFinite(line)) throw new Error("Over/under selection requires a line.");
  if (Number.isInteger(line) && goals === line) return { outcome: "void", reason: `Exactly ${line} goals: push.` };
  if (outcome === "OVER") return result(goals > line);
  if (outcome === "UNDER") return result(goals < line);
  throw new Error(`Unknown over/under outcome ${outcome}`);
}

/** A slip wins only if every non-void selection wins; any loss loses it; all void voids it. */
export function rollUpSlipStatus(statuses: SettlementOutcome[]): "pending" | "won" | "lost" | "void" {
  if (statuses.includes("lost")) return "lost";
  if (statuses.includes("pending")) return "pending";
  if (statuses.every((s) => s === "void")) return "void";
  return "won";
}
