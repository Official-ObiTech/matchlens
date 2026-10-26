import type { DataQualityGrade, MarketId } from "./types";

/**
 * Platform-independent prediction slip state. The web (zustand + localStorage)
 * and mobile (zustand + AsyncStorage) stores both delegate to this reducer so
 * the rules are identical everywhere.
 */
export interface SlipSelection {
  fixtureId: string; // provider-qualified id, e.g. "api_football:123"
  homeName: string;
  awayName: string;
  competition: string;
  kickoffAt: string;
  market: MarketId;
  outcome: string;
  line?: number;
  label: string;
  probability: number;
  dataQuality: DataQualityGrade;
  modelVersion: string;
  addedAt: string;
}

export interface SlipState {
  selections: SlipSelection[];
  maxSelections: number;
}

export const MAX_SLIP_SELECTIONS = 20;

export const emptySlip = (): SlipState => ({ selections: [], maxSelections: MAX_SLIP_SELECTIONS });

export type SlipAction =
  | { type: "add"; selection: SlipSelection }
  | { type: "remove"; fixtureId: string }
  | { type: "clear" }
  | { type: "restore"; selections: SlipSelection[] };

export type SlipAddResult = "added" | "replaced" | "unchanged" | "full";

/** Result of an add, so the UI can tell the user what happened. */
export function addOutcome(state: SlipState, sel: SlipSelection): SlipAddResult {
  const existing = state.selections.find((s) => s.fixtureId === sel.fixtureId);
  if (existing) return sameSelection(existing, sel) ? "unchanged" : "replaced";
  return state.selections.length >= state.maxSelections ? "full" : "added";
}

/**
 * One selection per match: adding a different market for a match already on
 * the slip replaces it in place (keeps its position) instead of duplicating.
 */
export function slipReducer(state: SlipState, action: SlipAction): SlipState {
  switch (action.type) {
    case "add": {
      const outcome = addOutcome(state, action.selection);
      if (outcome === "unchanged" || outcome === "full") return state;
      if (outcome === "replaced")
        return {
          ...state,
          selections: state.selections.map((s) => (s.fixtureId === action.selection.fixtureId ? action.selection : s)),
        };
      return { ...state, selections: [...state.selections, action.selection] };
    }
    case "remove":
      return { ...state, selections: state.selections.filter((s) => s.fixtureId !== action.fixtureId) };
    case "clear":
      return { ...state, selections: [] };
    case "restore": {
      const seen = new Set<string>();
      const deduped = action.selections.filter((s) => (seen.has(s.fixtureId) ? false : (seen.add(s.fixtureId), true)));
      return { ...state, selections: deduped.slice(0, state.maxSelections) };
    }
  }
}

function sameSelection(a: SlipSelection, b: SlipSelection) {
  return a.market === b.market && a.outcome === b.outcome && (a.line ?? null) === (b.line ?? null);
}

/**
 * Rough combined probability assuming independence between matches. Selections
 * are from different matches so independence is a reasonable first
 * approximation, but it is NOT a reliable estimate and the UI must label it so.
 */
export function independentCombinedProbability(selections: Pick<SlipSelection, "probability">[]): number | null {
  if (selections.length < 2) return null;
  return selections.reduce((p, s) => p * s.probability, 1);
}
