import type { Selection } from "../types";
import { DEFAULT_STRENGTH_PARAMS, type StrengthModelParams } from "./strength";

/**
 * Bump whenever anything that changes predicted probabilities changes.
 * Stored with every prediction so old records are never re-scored with a new model.
 */
export const MODEL_VERSION = "poisson-dc-1.0.0";

export interface SelectionCriteria {
  /** Minimum (calibrated) estimated probability for a selection to be recommended. */
  minProbability: number;
  /** Minimum model confidence (0..1). */
  minConfidence: number;
  minTeamMatches: number;
  minLeagueMatches: number;
  /** Abstain if the most recent model input is older than this relative to kickoff. */
  maxInputAgeDays: number;
}

export interface EngineConfig {
  strength: StrengthModelParams;
  criteria: SelectionCriteria;
  /** Calibration buckets need at least this many settled predictions to be trusted. */
  calibrationMinSample: number;
  /** Pseudo-count used to shrink observed bucket win rates toward the model. */
  calibrationPrior: number;
}

export const DEFAULT_CRITERIA: SelectionCriteria = {
  minProbability: 0.7,
  minConfidence: 0.55,
  minTeamMatches: 6,
  minLeagueMatches: 40,
  maxInputAgeDays: 45,
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  strength: DEFAULT_STRENGTH_PARAMS,
  criteria: DEFAULT_CRITERIA,
  calibrationMinSample: 50,
  calibrationPrior: 50,
};

/**
 * Markets the engine may *recommend*. Every market is still shown with its
 * probability; this only stops near-certain-but-uninformative picks
 * (e.g. "Over 0.5 goals") and loosely modelled ones from being promoted.
 */
export function isRecommendable(s: Selection): boolean {
  switch (s.market) {
    case "CORRECT_SCORE":
    case "FIRST_HALF_GOALS": // derived from a league-wide half-time share, not team-specific
      return false;
    // Extreme lines ("Over 0.5", "Under 4.5", "Team under 2.5") are almost always
    // true and carry little information, so they would crowd out useful picks.
    case "TOTAL_GOALS":
      return s.line != null && s.line >= 1.5 && s.line <= 3.5;
    case "HOME_TEAM_GOALS":
    case "AWAY_TEAM_GOALS":
      return s.line === 1.5;
    default:
      return true;
  }
}
