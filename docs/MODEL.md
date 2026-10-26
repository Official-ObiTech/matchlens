# Prediction model (`poisson-dc-1.0.0`)

## Method

1. **Team ratings.** A Maher-style Poisson model per competition:
   `E[home goals] = homeRate · attack[home] · defence[away]`, `E[away goals] = awayRate · attack[away] · defence[home]`.
   It is fitted by iterative scaling on all stored results before kickoff, from the current and previous season. Results are time-decayed (half-life 180 days), and every rating is shrunk toward the league average with 4 pseudo-matches, so teams with few results stay close to average.
2. **Low scores.** The Dixon-Coles ρ is estimated by grid search when at least 150 matches are available; otherwise ρ = 0.
3. **Score matrix.** P(home = h, away = a) for 0–10 goals, normalised to sum to 1.
4. **Markets.** All derived from that one matrix, so they are mutually consistent: 1X2, double chance, draw no bet (draw = void), total goals 0.5–4.5, BTTS, team goals, correct score. First-half goals is offered only when the league's observed half-time goal share is known. Corners, cards, xG, injuries, lineups and odds are not available from the free sources, so they are shown as unavailable and never estimated.

## Probability ≠ confidence

- **Estimated probability:** the model's chance of the outcome. After at least 50 settled predictions in the same probability range, it is adjusted by the observed bias, shrunk with 50 pseudo-observations ("calibrated").
- **Model confidence (0–1):** how far the estimate can be trusted. It averages a data-quality score (team sample size, league sample size, data freshness) with a stability score (how much the probability moves when expected goals shift by about one standard error). It is reduced by 10% while there is no calibration history.

## Recommendation and abstention

The engine recommends the eligible selection with the highest `calibrated probability × confidence`, subject to:
- probability ≥ 70% and confidence ≥ 0.55 (configurable in `engine/config.ts`);
- the market is recommendable. Near-certain, low-information lines (Over 0.5, Under 4.5, team under 2.5), first-half markets and correct score are shown but never recommended;
- the market is not historically over-confident in that probability range.

It abstains (*"No sufficiently reliable prediction is available for this match"*) when:
- either team has fewer than 6 results;
- the league has fewer than 40 results;
- the latest result is more than 45 days old;
- the match is not upcoming;
- the model is disabled;
- or nothing passes the filters.

Thresholds are never lowered to produce more picks.

High Confidence mode (75/80/85/90%+) is a filter over these recommendations, not a promise.

## Evaluation

- `runBacktest()` is a walk-forward test: each match is predicted from strictly earlier matches only, with optional held-out test dates.
- Outputs:
  - win rate with a 95% Wilson interval, mean predicted probability, Brier score and log loss;
  - results by market and by probability range;
  - multiclass 1X2 Brier score (a uniform guess scores 0.667);
  - abstention reasons.
- **Simulated-data check (unit test):** on 3 synthetic seasons generated from a known Poisson model, recommended picks won 80.0% against a mean estimate of 82.1–82.9% (n = 700 validation, 240 test). That gap is the expected winner's-curse effect of choosing the highest of several noisy estimates. The live calibration layer measures and corrects it. **This shows the maths is consistent, not that the model works on real football.** Real leagues violate the model's assumptions.
- **Real-data backtest:** run `npm run backtest -- --competition 39 --seasons 2022,2023 --test-from 2023-08-01` once you have a key. Judge the model on the *test* period, look at calibration by range, and require hundreds of settled picks before quoting a win rate.

A high win rate on high-probability markets does not by itself mean profitability or skill. Compare against bookmaker-implied probabilities (after removing the margin) before making any claim; the architecture supports adding odds later.
