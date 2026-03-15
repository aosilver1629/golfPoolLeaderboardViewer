import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchLeaderboard, playerDisplayName, normalizeGolferName } from "@/lib/golf-api";
import type { LeaderboardPlayer } from "@/lib/golf-api";
import { calculateGolferPoints } from "@/lib/points";
import { fetchWinOdds } from "@/lib/odds-api";
import { buildWinProbMap, buildWinProbFromScores, runSimulation } from "@/lib/prediction";

/** Parse position string "1", "T3" → number, "CUT"/"WD"/"DQ" → null */
function parsePosition(pos: string): number | null {
  if (!pos) return null;
  const upper = pos.toUpperCase();
  if (upper === "CUT" || upper === "WD" || upper === "DQ" || upper === "-") return null;
  return parseInt(upper.replace(/^T/, ""), 10) || null;
}

/** Parse score-to-par string "-12", "+3", "E", "-" → number */
function parseScoreToPar(score: string): number {
  if (!score || score === "-" || score === "E") return 0;
  return parseInt(score, 10) || 0;
}

/**
 * Unwrap MongoDB Extended JSON numbers that the Slash Golf API sometimes returns.
 * e.g. {"$numberInt":"2"} → 2, {"$numberDouble":"1.5"} → 1.5, 2 → 2
 */
function unwrapMongoNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  if (val && typeof val === "object") {
    if ("$numberInt" in val) return parseInt((val as Record<string, string>)["$numberInt"], 10) || 0;
    if ("$numberDouble" in val) return parseFloat((val as Record<string, string>)["$numberDouble"]) || 0;
  }
  return 0;
}

/** Same as unwrapMongoNumber but for string fields that may also be wrapped */
function unwrapMongoString(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    if ("$numberInt" in val) return String((val as Record<string, string>)["$numberInt"]);
    if ("$numberDouble" in val) return String((val as Record<string, string>)["$numberDouble"]);
  }
  return String(val ?? "");
}

export async function POST(request: NextRequest) {
  // Verify authorization: either cron secret or admin user
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isCron = authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const poolId = body.pool_id;

  if (!poolId) {
    return NextResponse.json({ error: "pool_id is required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: pool, error: poolError } = await supabase
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();

  if (poolError || !pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  if (!pool.tournament_id) {
    return NextResponse.json({ error: "No tournament_id configured for this pool" }, { status: 400 });
  }

  try {
    const [tournId, year] = pool.tournament_id.split(":");
    if (!tournId || !year) {
      return NextResponse.json(
        { error: "tournament_id must be in format 'tournId:year' (e.g. '011:2026')" },
        { status: 400 }
      );
    }

    // 1. Fetch live leaderboard + win odds in parallel
    const [apiLeaderboard, rawOdds] = await Promise.all([
      fetchLeaderboard(tournId, year) as Promise<LeaderboardPlayer[]>,
      fetchWinOdds().catch(() => null),
    ]);

    const now = new Date().toISOString();

    // 2. Bulk upsert all leaderboard rows in one call
    const leaderboardRows = apiLeaderboard.map((player) => {
      const position = unwrapMongoString(player.position);
      const total = unwrapMongoString(player.total);
      const thru = unwrapMongoString(player.thru);
      const statusLower = unwrapMongoString(player.status).toLowerCase();
      const isEliminated = statusLower === "cut" || statusLower === "wd" || statusLower === "dq";
      return {
        pool_id: poolId,
        golfer_name: playerDisplayName(player),
        golfer_api_id: String(unwrapMongoNumber(player.playerId) || player.playerId),
        position: isEliminated ? null : parsePosition(position),
        position_display: position || (isEliminated ? statusLower.toUpperCase() : ""),
        score_to_par: parseScoreToPar(total),
        current_round: unwrapMongoNumber(player.currentRound) || 1,
        thru,
        total_score: null,
        updated_at: now,
      };
    });

    const { error: upsertError } = await supabase
      .from("tournament_leaderboard")
      .upsert(leaderboardRows, { onConflict: "pool_id,golfer_api_id" });

    if (upsertError) {
      throw new Error(`Failed to upsert leaderboard: ${upsertError.message}`);
    }

    // 3. Get points table
    const { data: pointsTable } = await supabase
      .from("points_table")
      .select("*")
      .eq("pool_id", poolId);

    if (!pointsTable || pointsTable.length === 0) {
      return NextResponse.json({ error: "Points table not configured" }, { status: 400 });
    }

    // 4. Read the full DB leaderboard (includes any previously synced golfers)
    const { data: dbLeaderboard, error: dbError } = await supabase
      .from("tournament_leaderboard")
      .select("*")
      .eq("pool_id", poolId);

    if (dbError || !dbLeaderboard) {
      throw new Error(`Failed to read leaderboard: ${dbError?.message}`);
    }

    // 5. Calculate points per golfer
    const golferPoints = calculateGolferPoints(dbLeaderboard, pointsTable);

    // Build lookup maps
    const nameToApiId = new Map<string, string>();
    const apiIdToLeaderboard = new Map<string, typeof dbLeaderboard[0]>();
    for (const golfer of dbLeaderboard) {
      nameToApiId.set(normalizeGolferName(golfer.golfer_name), golfer.golfer_api_id);
      apiIdToLeaderboard.set(golfer.golfer_api_id, golfer);
    }

    // 6. Fetch all entries + picks in one query
    const { data: entries, error: entriesError } = await supabase
      .from("entries")
      .select("id, pool_id, entry_name, entry_picks(id, golfer_name, pick_type, golfer_api_id)")
      .eq("pool_id", poolId);

    if (entriesError || !entries) {
      throw new Error(`Failed to read entries: ${entriesError?.message}`);
    }

    // 7. Calculate all pick updates and entry totals in memory
    const pickUpdates: {
      id: string;
      entry_id: string;
      golfer_name: string;
      pick_type: string;
      current_points: number;
      current_position: string | null;
      golfer_api_id: string | null;
    }[] = [];

    const entryTotals: { id: string; pool_id: string; entry_name: string; total_points: number }[] = [];

    for (const entry of entries) {
      let totalPoints = 0;

      for (const pick of (entry.entry_picks || [])) {
        let apiId = pick.golfer_api_id;
        if (!apiId) {
          apiId = nameToApiId.get(normalizeGolferName(pick.golfer_name)) || null;
        }

        const points = apiId ? (golferPoints.get(apiId) ?? 0) : 0;
        const golferOnBoard = apiId ? apiIdToLeaderboard.get(apiId) : null;

        pickUpdates.push({
          id: pick.id,
          entry_id: entry.id,
          golfer_name: pick.golfer_name,
          pick_type: pick.pick_type,
          current_points: points,
          current_position: golferOnBoard?.position_display ?? null,
          golfer_api_id: apiId,
        });

        totalPoints += points;
      }

      entryTotals.push({ id: entry.id, pool_id: entry.pool_id, entry_name: entry.entry_name, total_points: totalPoints });
    }

    // 8. Bulk upsert all pick updates in one call
    const { error: picksError } = await supabase
      .from("entry_picks")
      .upsert(pickUpdates, { onConflict: "id" });

    if (picksError) {
      throw new Error(`Failed to update picks: ${picksError.message}`);
    }

    // 9+10. Compute ranks in memory
    entryTotals.sort((a, b) => b.total_points - a.total_points);

    let rank = 1;
    const entryUpdates = entryTotals.map(({ id, pool_id, entry_name, total_points }, i) => {
      if (i > 0 && total_points < entryTotals[i - 1].total_points) rank = i + 1;
      return { id, pool_id, entry_name, total_points, rank };
    });

    // 11. Run win-probability simulation (best-effort — failure never blocks sync)
    // Uses betting odds when available, falls back to score-based softmax model.
    let winProbMap: Map<string, number> | null = null;
    try {
      const winProbByApiId = rawOdds
        ? buildWinProbMap(rawOdds, dbLeaderboard)
        : buildWinProbFromScores(dbLeaderboard);

      // Build resolved picks from pickUpdates (golfer_api_ids already resolved)
      const entryPickMap = new Map<string, string[]>();
      for (const pick of pickUpdates) {
        if (pick.golfer_api_id) {
          const arr = entryPickMap.get(pick.entry_id) ?? [];
          arr.push(pick.golfer_api_id);
          entryPickMap.set(pick.entry_id, arr);
        }
      }

      const activePlayers = dbLeaderboard
        .filter((g) => g.position !== null)
        .map((g) => ({
          golfer_api_id: g.golfer_api_id,
          win_prob: winProbByApiId.get(g.golfer_api_id) ?? 0,
        }))
        .filter((p) => p.win_prob > 0);

      const entriesForSim = entries.map((entry) => ({
        entry_id: entry.id,
        picks: entryPickMap.get(entry.id) ?? [],
      }));

      winProbMap = runSimulation(activePlayers, entriesForSim, pointsTable);
    } catch (err) {
      console.warn("Win probability simulation skipped:", err);
    }

    // 12. Bulk upsert totals + ranks + win_probability in one call
    const entryUpdatesWithProbs = entryUpdates.map((e) => ({
      ...e,
      ...(winProbMap !== null ? { win_probability: winProbMap.get(e.id) ?? 0 } : {}),
    }));

    const { error: entryUpsertError } = await supabase
      .from("entries")
      .upsert(entryUpdatesWithProbs, { onConflict: "id" });

    if (entryUpsertError) {
      throw new Error(`Failed to update entries: ${entryUpsertError.message}`);
    }

    return NextResponse.json({
      success: true,
      golfers_updated: apiLeaderboard.length,
      entries_updated: entries.length,
      picks_updated: pickUpdates.length,
      simulation_ran: winProbMap !== null,
      simulation_source: winProbMap !== null ? (rawOdds ? "odds" : "scores") : null,
      synced_at: now,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
