import type {
  AbstainReason,
  DataQuality,
  DataQualityGrade,
  FixtureStatus,
  HistoricalMatch,
  MarketId,
  MarketProbability,
  Recommendation,
  SettlementOutcome,
  TeamSummary,
} from "./types";
import type { PerformanceSummary } from "./metrics";

/** Response contracts of the HTTP API, shared by the web and mobile clients. */

export interface TeamRef {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface CompetitionRef {
  id: string;
  name: string;
  country: string | null;
  logoUrl: string | null;
  season: number;
}

export interface PickSummary {
  market: MarketId;
  outcome: string;
  line?: number;
  label: string;
  probability: number;
  modelConfidence: number;
  dataQuality: DataQualityGrade;
  calibrated: boolean;
}

export type PredictionState = "recommended" | "abstained" | "not_generated";

export interface FixtureListItem {
  /** Public fixture id: "<provider>:<providerFixtureId>" */
  id: string;
  competition: CompetitionRef;
  home: TeamRef;
  away: TeamRef;
  kickoffAt: string;
  status: FixtureStatus;
  statusDetail: string | null;
  score: { home: number | null; away: number | null } | null;
  predictionState: PredictionState;
  pick: PickSummary | null;
  modelVersion: string | null;
}

export interface PublishedPredictionDto {
  id: string;
  fixtureId: string;
  modelVersion: string;
  label: string;
  market: MarketId;
  outcome: string;
  line?: number;
  probability: number;
  rawProbability: number;
  modelConfidence: number;
  dataQuality: DataQualityGrade;
  publishedAt: string;
  inputDataAt: string | null;
  status: SettlementOutcome;
  settledAt: string | null;
}

export interface PredictionRunDto {
  modelVersion: string;
  generatedAt: string;
  inputDataAt: string | null;
  expectedGoals: { home: number; away: number } | null;
  markets: MarketProbability[];
  recommendation: Recommendation | null;
  alternatives: Recommendation[];
  abstained: boolean;
  abstainReasons: AbstainReason[];
  quality: DataQuality;
  home: TeamSummary | null;
  away: TeamSummary | null;
  headToHead: HistoricalMatch[];
}

export interface MatchDetailDto {
  fixture: FixtureListItem & { venue: string | null; halfTime: { home: number | null; away: number | null } };
  run: PredictionRunDto | null;
  published: PublishedPredictionDto | null;
  dataUpdatedAt: string;
  notices: string[];
}

export interface FixturesResponse {
  date: string | null;
  fixtures: FixtureListItem[];
  page: number;
  hasMore: boolean;
  lastSyncAt: string | null;
  notices: string[];
}

export interface StrongestResponse {
  date: string;
  criteria: { minProbability: number; market: MarketId | null; competition: string | null; minQuality: DataQualityGrade | null };
  picks: (FixtureListItem & { pick: PickSummary; rankingScore: number })[];
  notices: string[];
}

export interface CalibrationRow {
  bucket: string;
  n: number;
  winRate: number | null;
  meanPredicted: number | null;
  interval: [number, number] | null;
}

export interface PerformanceResponse {
  modelVersion: string | null;
  overall: PerformanceSummary;
  byMarket: { key: string; summary: PerformanceSummary }[];
  byCompetition: { key: string; summary: PerformanceSummary }[];
  byProbability: { key: string; summary: PerformanceSummary }[];
  calibration: CalibrationRow[];
  /** Below this many settled predictions, the UI must not present win rates as established. */
  minSampleForClaims: number;
  recent: (PublishedPredictionDto & { homeName: string; awayName: string; competition: string; kickoffAt: string })[];
}

export interface SavedSlipDto {
  id: string;
  name: string | null;
  status: "pending" | "won" | "lost" | "void" | "partial";
  createdAt: string;
  shareToken: string | null;
  selections: {
    fixtureId: string;
    homeName: string;
    awayName: string;
    competition: string;
    kickoffAt: string;
    market: MarketId;
    outcome: string;
    line?: number;
    label: string;
    probability: number | null;
    dataQuality: DataQualityGrade | null;
    status: SettlementOutcome;
    score: { home: number | null; away: number | null } | null;
  }[];
}

export interface ApiError {
  error: string;
  message: string;
}

export const ABSTAIN_MESSAGES: Record<AbstainReason, string> = {
  MATCH_NOT_UPCOMING: "Predictions are only generated before kickoff.",
  INSUFFICIENT_TEAM_HISTORY: "Not enough recent results for at least one of the teams.",
  INSUFFICIENT_LEAGUE_HISTORY: "Not enough results in this competition to fit the model.",
  STALE_INPUTS: "The latest available results are too old to rely on.",
  LOW_MODEL_CONFIDENCE: "Probabilities are uncertain given the available data.",
  NO_SELECTION_MEETS_THRESHOLD: "No market reaches the required estimated probability.",
  POOR_HISTORICAL_CALIBRATION: "This model has been over-confident in this probability range historically.",
  MODEL_DISABLED: "The prediction model is temporarily disabled.",
};

export const NO_RELIABLE_PREDICTION = "No sufficiently reliable prediction is available for this match.";

export const RESPONSIBLE_NOTICE =
  "Probabilities are model estimates, not guarantees. Past performance does not ensure future results. This app does not take bets.";
