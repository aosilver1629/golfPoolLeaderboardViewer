/**
 * The Odds API — golf win odds
 *
 * Sign up: https://the-odds-api.com
 * Env var needed: ODDS_API_KEY
 * Free tier: 500 requests/month (sufficient for hourly tournament syncs)
 */

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

interface OddsOutcome {
  name: string;
  price: number; // decimal odds, e.g. 3.5 = +250
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}

interface OddsEvent {
  id: string;
  sport_key: string;
  bookmakers: OddsBookmaker[];
}

/**
 * Fetch win odds for the current PGA Tour event and return a map of
 * player name → vig-removed win probability.
 *
 * Averages implied probabilities across all available bookmakers before
 * normalizing, which reduces noise from any single book.
 *
 * Returns null if ODDS_API_KEY is not set or the request fails — callers
 * should treat null as "simulation unavailable" and skip gracefully.
 */
export async function fetchWinOdds(
  timeoutMs = 4000
): Promise<Map<string, number> | null> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(
      `${ODDS_API_BASE}/sports/golf_pga/odds?apiKey=${apiKey}&regions=us&markets=outrights&oddsFormat=decimal`,
      { signal: controller.signal, cache: "no-store" }
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return null;

  const events: OddsEvent[] = await res.json().catch(() => []);
  if (!events.length) return null;

  // Pick the event with the most total outcomes — that's the main live tournament
  const event = events.reduce((best, e) => {
    const outcomeCount = (ev: OddsEvent) =>
      ev.bookmakers.reduce((sum, b) => {
        const market = b.markets.find((m) => m.key === "outrights");
        return sum + (market?.outcomes.length ?? 0);
      }, 0);
    return outcomeCount(e) >= outcomeCount(best) ? e : best;
  });

  // Collect implied probability per player from each bookmaker
  const playerImplied = new Map<string, number[]>();
  for (const bookmaker of event.bookmakers) {
    const market = bookmaker.markets.find((m) => m.key === "outrights");
    if (!market) continue;
    for (const outcome of market.outcomes) {
      if (outcome.price <= 1) continue; // invalid decimal odds
      const implied = 1 / outcome.price;
      const arr = playerImplied.get(outcome.name) ?? [];
      arr.push(implied);
      playerImplied.set(outcome.name, arr);
    }
  }

  if (playerImplied.size === 0) return null;

  // Average across bookmakers, then remove vig by normalizing to sum to 1
  const rawProbs = new Map<string, number>();
  for (const [name, probs] of playerImplied) {
    rawProbs.set(name, probs.reduce((a, b) => a + b, 0) / probs.length);
  }

  const total = Array.from(rawProbs.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const normalized = new Map<string, number>();
  for (const [name, prob] of rawProbs) {
    normalized.set(name, prob / total);
  }

  return normalized;
}
