/**
 * Plackett-Luce Monte Carlo simulation for pool win probabilities.
 *
 * Win probabilities (λ parameters) are derived from one of two sources,
 * used in priority order:
 *   1. Betting odds (via The Odds API) — when available for the tournament
 *   2. Score-based softmax — always available once the tournament has started
 *
 * The score-based model converts score_to_par → win probability via:
 *   strength_i = exp(-k × score_to_par_i)
 *   win_prob_i = strength_i / Σ strength_j
 * A player at -10 is ~20x more likely to win than a player at E (k=0.3).
 *
 * Both sources feed the same Plackett-Luce simulation engine.
 */

import { normalizeGolferName } from "./golf-api";
import { getPointsForPosition } from "./points";

interface PointsTableRow {
  position_start: number;
  position_end: number;
  points: number;
}

interface LeaderboardRow {
  golfer_api_id: string;
  golfer_name: string;
  position: number | null;
}

interface ActivePlayer {
  golfer_api_id: string;
  win_prob: number;
}

interface EntryForSim {
  entry_id: string;
  picks: string[]; // golfer_api_ids
}

/**
 * Map Odds API player names → golfer_api_ids using normalized name matching.
 *
 * Active players (position !== null) with no odds match share the residual
 * probability evenly. CUT/WD players implicitly get 0 (they never appear
 * in activePlayers and therefore never affect the simulation output).
 */
export function buildWinProbMap(
  oddsNameProbs: Map<string, number>,
  leaderboard: LeaderboardRow[]
): Map<string, number> {
  // Build normalized-name → golfer_api_id lookup from leaderboard
  const normalizedToId = new Map<string, string>();
  for (const g of leaderboard) {
    normalizedToId.set(normalizeGolferName(g.golfer_name), g.golfer_api_id);
  }

  const result = new Map<string, number>();
  let matchedProbSum = 0;
  const matchedIds = new Set<string>();

  for (const [name, prob] of oddsNameProbs) {
    const apiId = normalizedToId.get(normalizeGolferName(name));
    if (apiId) {
      result.set(apiId, prob);
      matchedProbSum += prob;
      matchedIds.add(apiId);
    }
  }

  // Distribute residual probability to active players not covered by the odds
  // (sportsbooks typically only list the ~50 most likely contenders)
  const unmatchedActive = leaderboard.filter(
    (g) => g.position !== null && !matchedIds.has(g.golfer_api_id)
  );
  if (unmatchedActive.length > 0 && matchedProbSum < 1) {
    const residual = (1 - matchedProbSum) / unmatchedActive.length;
    for (const g of unmatchedActive) {
      result.set(g.golfer_api_id, Math.max(residual, 0));
    }
  }

  return result;
}

/**
 * Derive win probabilities from current score-to-par using a softmax
 * transformation. Used as the primary source when betting odds are unavailable.
 *
 * k controls score separation — higher k = leaders dominate more strongly.
 * k=0.3 gives ~2x probability per 2-shot lead, which is empirically reasonable.
 */
export function buildWinProbFromScores(
  leaderboard: Array<{ golfer_api_id: string; position: number | null; score_to_par: number }>,
  k = 0.3
): Map<string, number> {
  const active = leaderboard.filter((g) => g.position !== null);
  if (active.length === 0) return new Map();

  const strengths = active.map((g) => ({
    golfer_api_id: g.golfer_api_id,
    strength: Math.exp(-k * g.score_to_par),
  }));

  const total = strengths.reduce((s, p) => s + p.strength, 0);
  const result = new Map<string, number>();
  for (const { golfer_api_id, strength } of strengths) {
    result.set(golfer_api_id, strength / total);
  }
  return result;
}

/**
 * Run Plackett-Luce Monte Carlo simulation.
 *
 * Only active (non-CUT) players are simulated — their final positions are
 * uncertain. CUT players contribute 0 points and need no simulation.
 *
 * Returns a map of entry_id → estimated win probability.
 */
export function runSimulation(
  activePlayers: ActivePlayer[],
  entries: EntryForSim[],
  pointsTable: PointsTableRow[],
  nTrials = 10000
): Map<string, number> {
  const winCounts = new Map<string, number>(
    entries.map((e) => [e.entry_id, 0])
  );

  if (activePlayers.length === 0 || entries.length === 0) return winCounts;

  const totalWeight = activePlayers.reduce((s, p) => s + p.win_prob, 0);
  if (totalWeight <= 0) return winCounts;

  // Sort descending by win_prob so the inner sampling loop exits early most often
  const sorted = [...activePlayers].sort((a, b) => b.win_prob - a.win_prob);

  for (let t = 0; t < nTrials; t++) {
    const simPoints = simulateTrial(sorted, pointsTable);

    let maxPts = -1;
    let winnerId: string | null = null;

    for (const entry of entries) {
      let total = 0;
      for (const id of entry.picks) {
        total += simPoints.get(id) ?? 0;
      }
      if (total > maxPts) {
        maxPts = total;
        winnerId = entry.entry_id;
      }
    }

    if (winnerId !== null) {
      winCounts.set(winnerId, (winCounts.get(winnerId) ?? 0) + 1);
    }
  }

  const result = new Map<string, number>();
  for (const [id, count] of winCounts) {
    result.set(id, count / nTrials);
  }
  return result;
}

/**
 * Simulate one full tournament ordering via weighted sampling without
 * replacement (Plackett-Luce). Returns a map of golfer_api_id → points.
 */
function simulateTrial(
  players: ActivePlayer[],
  pointsTable: PointsTableRow[]
): Map<string, number> {
  const result = new Map<string, number>();
  const remaining = players.slice();
  let position = 1;

  while (remaining.length > 0) {
    const totalWeight = remaining.reduce((s, p) => s + p.win_prob, 0);

    let selected: ActivePlayer;
    if (totalWeight <= 0) {
      selected = remaining[0];
    } else {
      let r = Math.random() * totalWeight;
      selected = remaining[remaining.length - 1]; // fallback to last
      for (const p of remaining) {
        r -= p.win_prob;
        if (r <= 0) {
          selected = p;
          break;
        }
      }
    }

    result.set(selected.golfer_api_id, getPointsForPosition(position, pointsTable));
    remaining.splice(remaining.indexOf(selected), 1);
    position++;
  }

  return result;
}
