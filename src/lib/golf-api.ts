/**
 * Slash Golf API (via RapidAPI)
 *
 * Sign up: https://rapidapi.com/slashgolf/api/live-golf-data
 * Env vars needed:
 *   RAPIDAPI_KEY        — your RapidAPI key
 *   RAPIDAPI_HOST       — "live-golf-data.p.rapidapi.com" (default)
 */

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "live-golf-data.p.rapidapi.com";
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

function getHeaders() {
  const apiKey = process.env.RAPIDAPI_KEY || process.env.SLASH_GOLF_API_KEY;
  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY is not set. Sign up at https://rapidapi.com/slashgolf/api/live-golf-data");
  }
  return {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": RAPIDAPI_HOST,
  };
}

// ── Schedule ──────────────────────────────────────────────

interface ScheduleTournament {
  tournId: string;
  name: string;
  date: string;
  [key: string]: unknown;
}

/**
 * Fetch the PGA Tour season schedule.
 * Use this to find the `tournId` for a specific tournament.
 */
export async function fetchSchedule(): Promise<ScheduleTournament[]> {
  const res = await fetch(`${RAPIDAPI_BASE}/schedule`, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Schedule API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.schedule || data;
}

// ── Leaderboard ───────────────────────────────────────────

export interface LeaderboardPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  /** Numeric position as string: "1", "T3", "CUT", "WD", "DQ" */
  position: string;
  /** Score to par as string: "-12", "+3", "E", "-" */
  total: string;
  currentRound: number;
  thru: string;
  /** "complete" | "cut" | "wd" */
  status: string;
  [key: string]: unknown;
}

/**
 * Fetch the tournament field (pre-tournament player list).
 * Works before the tournament starts. Use this to get player IDs.
 */
export async function fetchField(
  tournId: string,
  year: string
): Promise<LeaderboardPlayer[]> {
  const url = `${RAPIDAPI_BASE}/field?orgId=1&tournId=${tournId}&year=${year}`;

  const res = await fetch(url, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Field API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  // Field endpoint returns players array — normalize to same shape as leaderboard
  const players = data.fieldPlayers || data.players || data.field || data;
  if (!Array.isArray(players)) return [];
  return players;
}

/**
 * Fetch the live leaderboard for a tournament.
 * @param tournId  — from the /schedule endpoint
 * @param year     — e.g. "2026"
 * @param roundId  — optional, omit for current/latest round
 */
export async function fetchLeaderboard(
  tournId: string,
  year: string,
  roundId?: string
): Promise<LeaderboardPlayer[]> {
  let url = `${RAPIDAPI_BASE}/leaderboard?orgId=1&tournId=${tournId}&year=${year}`;
  if (roundId) url += `&roundId=${roundId}`;

  const res = await fetch(url, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Leaderboard API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.leaderboardRows || data.leaderboard || [];
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Build a display name from the API response fields.
 */
export function playerDisplayName(player: LeaderboardPlayer): string {
  const first = typeof player.firstName === "string" ? player.firstName : String(player.firstName ?? "");
  const last = typeof player.lastName === "string" ? player.lastName : String(player.lastName ?? "");
  return `${first} ${last}`.trim();
}

/**
 * Normalize a golfer name for fuzzy matching.
 * Handles differences like "Scottie Scheffler" vs "Scheffler, Scottie"
 */
export function normalizeGolferName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .sort()
    .join(" ")
    .trim();
}
