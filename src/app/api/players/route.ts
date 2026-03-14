import { NextRequest, NextResponse } from "next/server";
import { fetchField, fetchLeaderboard, playerDisplayName } from "@/lib/golf-api";
import type { LeaderboardPlayer } from "@/lib/golf-api";

/**
 * GET /api/players?tournId=011&year=2026
 *
 * Returns a list of { playerId, firstName, lastName, displayName }
 * for a given tournament. Tries /field first (works pre-tournament),
 * falls back to /leaderboard (works once the tournament has started).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tournId = searchParams.get("tournId");
  const year = searchParams.get("year");

  if (!tournId || !year) {
    return NextResponse.json(
      { error: "tournId and year query params are required" },
      { status: 400 }
    );
  }

  let players: LeaderboardPlayer[] = [];
  let source = "";
  const errors: string[] = [];

  // Try /field first (works before tournament starts)
  try {
    const field = await fetchField(tournId, year);
    if (field.length > 0) {
      players = field;
      source = "field";
    }
  } catch (err) {
    errors.push(`field: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fall back to /leaderboard (works once tournament has started)
  if (players.length === 0) {
    try {
      const leaderboard = await fetchLeaderboard(tournId, year);
      if (leaderboard.length > 0) {
        players = leaderboard;
        source = "leaderboard";
      }
    } catch (err) {
      errors.push(`leaderboard: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (players.length === 0) {
    console.error("Players API — both endpoints failed:", errors);
    return NextResponse.json(
      {
        error: `No players found for tournId=${tournId} year=${year}. Tried: ${errors.join("; ")}`,
        tournId,
        year,
      },
      { status: 404 }
    );
  }

  const result = players.map((p) => ({
    playerId: String(p.playerId),
    firstName: p.firstName,
    lastName: p.lastName,
    displayName: playerDisplayName(p),
  }));

  console.log(`Players API — loaded ${result.length} players from ${source}`);
  return NextResponse.json({ players: result, source });
}
