/**
 * Golfer Name Matching Engine
 *
 * Matches messy spreadsheet golfer names directly to API player records.
 * No intermediate clustering — each raw name gets matched to the best
 * API player using: known aliases → exact last name → fuzzy Levenshtein.
 */

// ── Types ─────────────────────────────────────────────────

export interface ApiPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export interface NameMatch {
  /** The raw name from the spreadsheet */
  rawName: string;
  /** How many entries use this name */
  count: number;
  /** Best-matched API player (null = no match) */
  match: ApiPlayer | null;
  /** Match confidence: high (alias/exact), medium (fuzzy), none */
  confidence: "high" | "medium" | "none";
}

// ── Levenshtein distance ──────────────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Normalize for comparison ──────────────────────────────

function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ")
    .trim();
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase().replace(/[^a-z]/g, "");
}

// ── Known aliases: spreadsheet misspelling → canonical last name ──
// This maps common misspellings to the correct last name so we can
// find the right API player even with wild typos.

const LAST_NAME_ALIASES: Record<string, string> = {
  // Schauffele variants
  schaufelle: "schauffele",
  schauffelle: "schauffele",
  schauffle: "schauffele",
  schauffale: "schauffele",
  schuaffele: "schauffele",
  // Scheffler variants
  schleffer: "scheffler",
  schefflar: "scheffler",
  scheffer: "scheffler",
  schefler: "scheffler",
  scheffeler: "scheffler",
  // McIlroy variants
  mcilroy: "mcilroy",
  mcelroy: "mcilroy",
  mcllroy: "mcilroy",
  macilroy: "mcilroy",
  // Fleetwood variants
  fleetwod: "fleetwood",
  fleetwoood: "fleetwood",
  fleetwodd: "fleetwood",
  // Morikawa variants
  morakawa: "morikawa",
  moriakawa: "morikawa",
  morikowa: "morikawa",
  // Gotterup variants
  gooterup: "gotterup",
  goterup: "gotterup",
  gotterrup: "gotterup",
  // Henley variants
  henely: "henley",
  hennley: "henley",
  // MacIntyre variants
  macintire: "macintyre",
  mcintyre: "macintyre",
  mcintire: "macintyre",
  macintyer: "macintyre",
  // Matsuyama variants
  matusyama: "matsuyama",
  matsuyma: "matsuyama",
  matsuayama: "matsuyama",
  matsuyamma: "matsuyama",
  // Hovland variants
  hoveland: "hovland",
  // Fitzpatrick variants
  fitzpatrik: "fitzpatrick",
  fitspatrick: "fitzpatrick",
  fitzpactrick: "fitzpatrick",
  // Aberg variants
  aburg: "aberg",
  // McNealy variants
  mcneely: "mcnealy",
  mcnealey: "mcnealy",
  macnealy: "mcnealy",
  // Gerard variants
  gerrard: "gerard",
  // Bhatia variants
  bahatia: "bhatia",
  bhattia: "bhatia",
  bhatiya: "bhatia",
  // Kim – Si Woo variants (match by full name norm)
  // Conners variants
  connors: "conners",
  // Theegala variants
  theegla: "theegala",
  theegela: "theegala",
  theagala: "theegala",
  teegala: "theegala",
  // Cantlay variants
  cantley: "cantlay",
  cantaly: "cantlay",
  // Koepka variants
  koepke: "koepka",
  kopeka: "koepka",
  kepka: "koepka",
  // Spieth variants
  speith: "spieth",
  speth: "spieth",
  // Horschel variants
  horsechel: "horschel",
  horshcel: "horschel",
  horschell: "horschel",
  // Bezuidenhout variants
  bezuidenhut: "bezuidenhout",
  bezuidenhoudt: "bezuidenhout",
  bezuidenhoud: "bezuidenhout",
  // Zalatoris variants
  zalatoras: "zalatoris",
  // Kitayama variants
  kitayma: "kitayama",
  kitiyama: "kitayama",
  // Jaeger variants
  jager: "jaeger",
  yeager: "jaeger",
  // Pendrith variants
  pendtrith: "pendrith",
  pendreth: "pendrith",
  // Bradley variants
  bradely: "bradley",
};

// Full name overrides for names that can't be resolved by last name alone
// (e.g., "SW Kim" → "Si Woo Kim", "JT" → "Justin Thomas")
const FULL_NAME_OVERRIDES: Record<string, string> = {
  "sw kim": "si woo kim",
  "s.w. kim": "si woo kim",
  "so woo kim": "si woo kim",
  "siwoo kim": "si woo kim",
  "si-woo kim": "si woo kim",
  "jt": "justin thomas",
  "dj": "dustin johnson",
  "jj spaun": "j.j. spaun",
  "j.j spaun": "j.j. spaun",
  "j j spaun": "j.j. spaun",
  "jj spawn": "j.j. spaun",
  "jt poston": "j.t. poston",
  "j.t poston": "j.t. poston",
  "j t poston": "j.t. poston",
  "bh an": "byeong hun an",
  "b.h. an": "byeong hun an",
  "ben an": "byeong hun an",
  "mw lee": "min woo lee",
  "m.w. lee": "min woo lee",
  "minwoo lee": "min woo lee",
  "min-woo lee": "min woo lee",
  "cam young": "cameron young",
  "cam smith": "cameron smith",
  "ricky fowler": "rickie fowler",
  "scotty scheffler": "scottie scheffler",
  "bob macintyre": "robert macintyre",
  "colin morikawa": "collin morikawa",
  "charlie hoffman": "charley hoffman",
  "victor hovland": "viktor hovland",
  "ludwig aberg": "ludvig aberg",
  "russel henley": "russell henley",
  "denis mccarthy": "denny mccarthy",
  "cory conners": "corey conners",
  "matthew fitzpatrick": "matt fitzpatrick",
  "alexander noren": "alex noren",
  "sung jae im": "sungjae im",
  "sungjae im": "sungjae im",
  "im sungjae": "sungjae im",
};

// ── Main matching function ────────────────────────────────

/**
 * Match a list of raw golfer names from a spreadsheet against
 * API player records. Returns a NameMatch for each unique raw name.
 */
export function matchNamesToPlayers(
  rawNames: string[],
  apiPlayers: ApiPlayer[]
): NameMatch[] {
  // Count occurrences of each raw name (case-insensitive)
  const countMap = new Map<string, { name: string; count: number }>();
  for (const raw of rawNames) {
    const key = raw.trim().toLowerCase();
    const existing = countMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      countMap.set(key, { name: raw.trim(), count: 1 });
    }
  }

  const results: NameMatch[] = [];

  for (const { name: rawName, count } of countMap.values()) {
    const result = findBestMatch(rawName, apiPlayers);
    results.push({
      rawName,
      count,
      match: result.player,
      confidence: result.confidence,
    });
  }

  // Sort: no-match first (needs attention), then by count desc
  results.sort((a, b) => {
    const confOrder = { none: 0, medium: 1, high: 2 };
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence];
    }
    return b.count - a.count;
  });

  return results;
}

/**
 * Find the best matching API player for a single raw name.
 */
function findBestMatch(
  rawName: string,
  apiPlayers: ApiPlayer[]
): { player: ApiPlayer | null; confidence: "high" | "medium" | "none" } {
  const rawLower = rawName.toLowerCase().trim();
  const rawNorm = norm(rawName);

  // 1. Check full-name overrides first
  const override = FULL_NAME_OVERRIDES[rawLower];
  if (override) {
    const overrideNorm = norm(override);
    const match = apiPlayers.find((p) => norm(p.displayName) === overrideNorm);
    if (match) return { player: match, confidence: "high" };
  }

  // 2. Exact normalized full-name match against API players
  for (const player of apiPlayers) {
    if (norm(player.displayName) === rawNorm) {
      return { player, confidence: "high" };
    }
  }

  // 3. Last-name match (resolve aliases first)
  const rawLast = lastName(rawName);
  const resolvedLast = LAST_NAME_ALIASES[rawLast] || rawLast;

  const lastNameMatches = apiPlayers.filter(
    (p) => p.lastName.toLowerCase().replace(/[^a-z]/g, "") === resolvedLast
  );

  if (lastNameMatches.length === 1) {
    return { player: lastNameMatches[0], confidence: "high" };
  }

  // If multiple players share the same last name, try first initial
  if (lastNameMatches.length > 1) {
    const rawFirst = rawName
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z]/g, "");
    if (rawFirst) {
      const firstMatch = lastNameMatches.find(
        (p) =>
          p.firstName.toLowerCase().startsWith(rawFirst) ||
          rawFirst.startsWith(p.firstName.toLowerCase().charAt(0))
      );
      if (firstMatch) return { player: firstMatch, confidence: "high" };
    }
    // Fall back to first match with medium confidence
    return { player: lastNameMatches[0], confidence: "medium" };
  }

  // 4. Fuzzy match on last name against API players
  let bestPlayer: ApiPlayer | null = null;
  let bestDist = Infinity;

  for (const player of apiPlayers) {
    const playerLast = player.lastName.toLowerCase().replace(/[^a-z]/g, "");
    const dist = levenshtein(resolvedLast, playerLast);
    const threshold = Math.max(
      2,
      Math.floor(Math.max(resolvedLast.length, playerLast.length) * 0.3)
    );
    if (dist < bestDist && dist <= threshold) {
      bestDist = dist;
      bestPlayer = player;
    }
  }

  if (bestPlayer && bestDist <= 2) {
    return { player: bestPlayer, confidence: "high" };
  }
  if (bestPlayer) {
    return { player: bestPlayer, confidence: "medium" };
  }

  // 5. Fuzzy match on full normalized name
  for (const player of apiPlayers) {
    const playerNorm = norm(player.displayName);
    const dist = levenshtein(rawNorm, playerNorm);
    const threshold = Math.max(
      3,
      Math.floor(Math.max(rawNorm.length, playerNorm.length) * 0.3)
    );
    if (dist < bestDist && dist <= threshold) {
      bestDist = dist;
      bestPlayer = player;
    }
  }

  if (bestPlayer) {
    return { player: bestPlayer, confidence: "medium" };
  }

  return { player: null, confidence: "none" };
}
