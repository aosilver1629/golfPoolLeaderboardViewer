import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LeaderboardTable from "@/components/LeaderboardTable";
import LocalTimestamp from "@/components/LocalTimestamp";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get pools the user is a member of (or created)
  const { data: memberPools } = await supabase
    .from("pool_members")
    .select("pool_id")
    .eq("user_id", user.id);

  const { data: createdPools } = await supabase
    .from("pools")
    .select("id")
    .eq("created_by", user.id);

  const allIds = [
    ...(memberPools?.map((p: { pool_id: string }) => p.pool_id) || []),
    ...(createdPools?.map((p: { id: string }) => p.id) || []),
  ];
  const poolIds = allIds.filter((id: string, i: number) => allIds.indexOf(id) === i);

  if (poolIds.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-700 mb-2">No Pools Yet</h2>
        <p className="text-slate-500 mb-4">
          Join a pool with an invite code or create one as an admin.
        </p>
        <a
          href="/join"
          className="inline-block bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
        >
          Join a Pool
        </a>
      </div>
    );
  }

  // Use the first pool (can be enhanced to pool selector later)
  const poolId = poolIds[0];

  const { data: pool } = await supabase
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();

  // Get entries with picks for this pool
  const { data: entries } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      user_id,
      total_points,
      rank,
      tiebreaker_score,
      win_probability,
      entry_picks (
        id,
        golfer_name,
        golfer_api_id,
        pick_type,
        current_position,
        current_points
      )
    `)
    .eq("pool_id", poolId)
    .order("total_points", { ascending: false });

  // Get unclaimed entries so users can claim from the leaderboard
  const { data: unclaimedEntries } = await supabase
    .from("entries")
    .select("id, entry_name")
    .eq("pool_id", poolId)
    .is("user_id", null);

  // Get the latest leaderboard update time
  const { data: lastUpdate } = await supabase
    .from("tournament_leaderboard")
    .select("updated_at")
    .eq("pool_id", poolId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {pool?.name || "Pool Leaderboard"}
          </h1>
          {lastUpdate && (
            <p className="text-sm text-slate-500 mt-1">
              Last updated: <LocalTimestamp isoString={lastUpdate.updated_at} />
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              pool?.status === "active"
                ? "bg-green-100 text-green-700"
                : pool?.status === "completed"
                ? "bg-slate-100 text-slate-600"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {pool?.status?.toUpperCase()}
          </span>
        </div>
      </div>

      <LeaderboardTable
        entries={entries || []}
        currentUserId={user.id}
        poolId={poolId}
        isAdmin={profile?.is_admin || false}
        totalEntries={entries?.length || 0}
        unclaimedEntries={unclaimedEntries || []}
      />
    </div>
  );
}
