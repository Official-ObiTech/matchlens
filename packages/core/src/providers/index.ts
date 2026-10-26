import type { ProviderId } from "../types";
import { ApiFootballProvider } from "./apiFootball";
import { FootballDataOrgProvider } from "./footballData";
import type { FootballDataProvider, ProviderOptions } from "./types";

export * from "./types";
export { ApiFootballProvider, mapApiFootballFixture } from "./apiFootball";
export { FootballDataOrgProvider, mapFootballDataMatch } from "./footballData";

/**
 * Provider registry. To add a paid provider: implement FootballDataProvider,
 * map its payloads to the internal Fixture model, and register it here.
 */
export function createProvider(id: ProviderId, opts: ProviderOptions): FootballDataProvider {
  switch (id) {
    case "api_football":
      return new ApiFootballProvider(opts);
    case "football_data":
      return new FootballDataOrgProvider(opts);
  }
}

/** Default competitions synced on the free tier (keeps request usage predictable). */
export const DEFAULT_COMPETITIONS: Record<ProviderId, string[]> = {
  // Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga, Championship
  api_football: ["39", "140", "135", "78", "61", "88", "94", "40"],
  // PL, PD, SA, BL1, FL1, DED, PPL, ELC (football-data.org numeric ids)
  football_data: ["2021", "2014", "2019", "2002", "2015", "2003", "2017", "2016"],
};
