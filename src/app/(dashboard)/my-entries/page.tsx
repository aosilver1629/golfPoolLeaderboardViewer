import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ClaimEntry from "@/components/ClaimEntry";

export const dynamic = "force-dynamic";

export default async function MyEntriesPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get pools the user belongs to
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
  const poolIds = allIds.filter((id, i) => allIds.indexOf(id) === i);

  if (poolIds.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Join a pool first to see your entries.</p>
      </div>
    );
  }

  const poolId = poolIds[0];

  // Get entries claimed by this user
  const { data: myEntries } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      total_points,
      rank,
      tiebreaker_score,
      entry_picks (
        id,
        golfer_name,
        pick_type,
        current_position,
        current_points
      )
    `)
    .eq("pool_id", poolId)
    .eq("user_id", user.id)
    .order("total_points", { ascending: false });

  // Get unclaimed entries for claiming
  const { data: unclaimedEntries } = await supabase
    .from("entries")
    .select("id, entry_name")
    .eq("pool_id", poolId)
    .is("user_id", null);

  const pickTypeLabel: Record<string, string> = {
    group_a: "Group A",
    group_b: "Group B",
    group_c: "Group C",
    group_d: "Group D",
    wildcard: "Wildcard",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">My Entries</h1>

      {myEntries && myEntries.length > 0 ? (
        <div className="space-y-4">
          {myEntries.map((entry) => (
            <div key={entry.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900">{entry.entry_name}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">
                    Rank: #{entry.rank || "-"}
                  </span>
                  <span className="text-lg font-bold text-green-700">
                    {entry.total_points} pts
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {entry.entry_picks
                  .sort((a, b) => {
                    const order = ["group_a", "group_b", "group_c", "group_d", "wildcard"];
                    return order.indexOf(a.pick_type) - order.indexOf(b.pick_type);
                  })
                  .map((pick) => (
                    <div
                      key={pick.id}
                      className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="text-xs text-slate-400 mr-2">
                          {pickTypeLabel[pick.pick_type]}
                        </span>
                        <span className="text-slate-800 font-medium">
                          {pick.golfer_name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 mr-2">
                          {pick.current_position || "-"}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {pick.current_points} pts
                        </span>
                      </div>
                    </div>
                  ))}
              </div>

              {entry.tiebreaker_score && (
                <p className="text-sm text-slate-500 mt-2">
                  Tiebreaker: {entry.tiebreaker_score}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 text-center text-slate-500 mb-6">
          <p>You haven&apos;t claimed any entries yet.</p>
          <p className="text-sm mt-1">
            Find your name in the list below and claim your entries.
          </p>
        </div>
      )}

      {unclaimedEntries && unclaimedEntries.length > 0 && (
        <ClaimEntry entries={unclaimedEntries} />
      )}
    </div>
  );
}
