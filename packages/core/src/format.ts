import type { DataQualityGrade, FixtureStatus, SettlementOutcome } from "./types";

/** Display helpers shared by web and mobile so both present numbers identically. */

export const pct = (p: number | null | undefined, digits = 0) => (p == null ? "–" : `${(p * 100).toFixed(digits)}%`);

export const kickoffTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export const kickoffDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export const STATUS_LABEL: Record<FixtureStatus, string> = {
  scheduled: "Scheduled",
  tbd: "Time TBC",
  live: "Live",
  finished: "Full time",
  postponed: "Postponed",
  suspended: "Suspended",
  cancelled: "Cancelled",
  abandoned: "Abandoned",
  awarded: "Awarded",
  unknown: "Unknown",
};

export const QUALITY_LABEL: Record<DataQualityGrade, string> = {
  A: "Strong data",
  B: "Good data",
  C: "Limited data",
  D: "Weak data",
};

export const OUTCOME_LABEL: Record<SettlementOutcome, string> = {
  pending: "Pending",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

export const MARKET_LABEL: Record<string, string> = {
  "1X2": "Match result",
  DOUBLE_CHANCE: "Double chance",
  DRAW_NO_BET: "Draw no bet",
  TOTAL_GOALS: "Total goals",
  BTTS: "Both teams to score",
  HOME_TEAM_GOALS: "Home team goals",
  AWAY_TEAM_GOALS: "Away team goals",
  FIRST_HALF_GOALS: "First-half goals",
  CORRECT_SCORE: "Correct score",
};

/** Today's date in the device's local timezone, YYYY-MM-DD. */
export function localToday(offsetDays = 0, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
