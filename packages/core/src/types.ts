/**
 * Internal, provider-independent data model. Every football data provider is
 * mapped into these shapes; nothing above the provider layer should ever see
 * a raw provider payload.
 */

export type ProviderId = "api_football" | "football_data";

/** Normalised match status. Provider-specific codes are mapped onto these. */
export type FixtureStatus =
  | "scheduled" // not started, kickoff time confirmed
  | "tbd" // not started, kickoff time not confirmed
  | "live" // in play / half-time / break
  | "finished" // full time (incl. after extra time / penalties)
  | "postponed"
  | "suspended" // interrupted, may resume
  | "cancelled"
  | "abandoned"
  | "awarded" // result decided administratively
  | "unknown";

export interface Competition {
  provider: ProviderId;
  providerId: string;
  name: string;
  country: string | null;
  logoUrl: string | null;
  season: number;
}

export interface Team {
  provider: ProviderId;
  providerId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
}

export interface Score {
  home: number | null;
  away: number | null;
}

export interface Fixture {
  provider: ProviderId;
  providerId: string;
  competition: Competition;
  homeTeam: Team;
  awayTeam: Team;
  /** ISO-8601 UTC kickoff time */
  kickoffAt: string;
  status: FixtureStatus;
  /** Raw provider status text, kept for display/debugging only. */
  statusDetail: string | null;
  venue: string | null;
  /** Score after 90 minutes plus stoppage time — what most markets settle on. */
  regularTime: Score;
  halfTime: Score;
  /** Final score including extra time if played. */
  final: Score;
}

/** A completed match reduced to what the model needs. */
export interface HistoricalMatch {
  fixtureId: string;
  date: string; // ISO
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  htHomeGoals: number | null;
  htAwayGoals: number | null;
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

export type MarketId =
  | "1X2"
  | "DOUBLE_CHANCE"
  | "DRAW_NO_BET"
  | "TOTAL_GOALS"
  | "BTTS"
  | "HOME_TEAM_GOALS"
  | "AWAY_TEAM_GOALS"
  | "FIRST_HALF_GOALS"
  | "CORRECT_SCORE";

/**
 * A selection identifies one outcome inside a market.
 * Examples: {market:"1X2", outcome:"HOME"}, {market:"TOTAL_GOALS", outcome:"OVER", line:2.5}
 */
export interface Selection {
  market: MarketId;
  outcome: string;
  line?: number;
}

export interface MarketProbability extends Selection {
  /** Model probability that this selection wins (0..1). */
  probability: number;
  /**
   * Probability the selection is voided (stake returned), e.g. Draw No Bet on a draw.
   * Win/lose probabilities are reported unconditionally; push is separate.
   */
  pushProbability?: number;
  label: string;
}

export type DataQualityGrade = "A" | "B" | "C" | "D";

export interface DataQuality {
  grade: DataQualityGrade;
  /** 0..1 composite score */
  score: number;
  homeMatches: number;
  awayMatches: number;
  leagueMatches: number;
  /** ISO time of the most recent result used as model input. */
  latestInputAt: string | null;
  /** Days between the most recent input and the kickoff. */
  inputAgeDays: number | null;
  notes: string[];
  /** Inputs the provider/plan does not supply — shown, never invented. */
  unavailable: string[];
}

export type AbstainReason =
  | "MATCH_NOT_UPCOMING"
  | "INSUFFICIENT_TEAM_HISTORY"
  | "INSUFFICIENT_LEAGUE_HISTORY"
  | "STALE_INPUTS"
  | "LOW_MODEL_CONFIDENCE"
  | "NO_SELECTION_MEETS_THRESHOLD"
  | "POOR_HISTORICAL_CALIBRATION"
  | "MODEL_DISABLED";

export interface Recommendation extends MarketProbability {
  /** Probability after applying historical calibration (equals raw when uncalibrated). */
  calibratedProbability: number;
  calibrated: boolean;
  /** 0..1 — how much the system trusts the estimate. NOT a probability of winning. */
  modelConfidence: number;
  rankingScore: number;
  reasoning: string[];
}

export interface TeamSummary {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  failedToScore: number;
  /** Most recent first: W/D/L */
  form: ("W" | "D" | "L")[];
  home: { played: number; goalsFor: number; goalsAgainst: number };
  away: { played: number; goalsFor: number; goalsAgainst: number };
  /** Model attack/defence multipliers relative to league average (1 = average). */
  attack: number | null;
  defence: number | null;
  /** Position in a table computed from results available to the model. */
  position: number | null;
}

export interface PredictionResult {
  modelVersion: string;
  generatedAt: string;
  fixtureId: string;
  expectedGoals: { home: number; away: number } | null;
  markets: MarketProbability[];
  recommendation: Recommendation | null;
  /** Other selections that also passed every filter, best first. */
  alternatives: Recommendation[];
  abstained: boolean;
  abstainReasons: AbstainReason[];
  quality: DataQuality;
  home: TeamSummary | null;
  away: TeamSummary | null;
  headToHead: HistoricalMatch[];
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export type SettlementOutcome = "won" | "lost" | "void" | "pending";
