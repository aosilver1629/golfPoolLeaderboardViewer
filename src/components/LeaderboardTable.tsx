"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface EntryPick {
  id: string;
  golfer_name: string;
  pick_type: string;
  current_position: string | null;
  current_points: number;
}

interface Entry {
  id: string;
  entry_name: string;
  user_id: string | null;
  total_points: number;
  rank: number | null;
  tiebreaker_score: number | null;
  entry_picks: EntryPick[];
}

interface LeaderboardTableProps {
  entries: Entry[];
  currentUserId: string;
  poolId: string;
  isAdmin: boolean;
  totalEntries: number;
}

const pickTypeLabel: Record<string, string> = {
  group_a: "A",
  group_b: "B",
  group_c: "C",
  group_d: "D",
  wildcard: "WC",
};

const pickOrder = ["group_a", "group_b", "group_c", "group_d", "wildcard"];

export default function LeaderboardTable({
  entries,
  currentUserId,
  poolId,
  isAdmin,
  totalEntries,
}: LeaderboardTableProps) {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  const prizePlaces = Math.floor(totalEntries / 17) || 1;

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: poolId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(`Sync failed: ${data.error}`);
      }
    } catch {
      alert("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            {syncing ? "Syncing..." : "Refresh Leaderboard"}
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Header */}
        <div className="bg-green-700 text-white text-sm flex items-center">
          <div className="px-3 py-3 w-14 flex-shrink-0 font-medium">Rank</div>
          <div className="px-3 py-3 flex-1 font-medium min-w-0">Entry</div>
          <div className="px-3 py-3 text-right w-20 flex-shrink-0 font-medium">Points</div>
          <div className="px-3 py-3 text-center w-16 flex-shrink-0 font-medium hidden sm:block">TB</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-100">
          {entries.map((entry, index) => {
            const isCurrentUser = entry.user_id === currentUserId;
            const isExpanded = expandedEntry === entry.id;
            const isPrizePosition = (entry.rank || index + 1) <= prizePlaces;

            return (
              <div
                key={entry.id}
                className={`${isCurrentUser ? "bg-green-50" : "bg-white"} ${
                  isPrizePosition ? "border-l-4 border-l-yellow-400" : "border-l-4 border-l-transparent"
                }`}
              >
                <button
                  onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                  className="w-full text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center">
                    <div className="px-3 py-3 w-14 flex-shrink-0 text-sm font-semibold text-slate-700">
                      {entry.rank || index + 1}
                    </div>
                    <div className="px-3 py-3 flex-1 min-w-0">
                      <span
                        className={`text-sm font-medium truncate block ${
                          isCurrentUser ? "text-green-700" : "text-slate-900"
                        }`}
                      >
                        {entry.entry_name}
                      </span>
                    </div>
                    <div className="px-3 py-3 text-right w-20 flex-shrink-0">
                      <span className="text-sm font-bold text-slate-900">
                        {Math.round(entry.total_points)}
                      </span>
                    </div>
                    <div className="px-3 py-3 text-center w-16 flex-shrink-0 hidden sm:block">
                      <span className="text-sm text-slate-500">
                        {entry.tiebreaker_score || "-"}
                      </span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3">
                      {entry.entry_picks
                        .slice()
                        .sort((a, b) => pickOrder.indexOf(a.pick_type) - pickOrder.indexOf(b.pick_type))
                        .map((pick) => (
                          <div
                            key={pick.id}
                            className="flex items-center justify-between bg-white rounded-md px-3 py-2 text-sm border border-slate-200"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                {pickTypeLabel[pick.pick_type] || pick.pick_type}
                              </span>
                              <span className="text-slate-800 truncate">{pick.golfer_name}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className="text-xs text-slate-500">
                                {pick.current_position || "-"}
                              </span>
                              <span className="font-semibold text-slate-700">
                                {pick.current_points}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                    {entry.tiebreaker_score && (
                      <p className="text-xs text-slate-500 mt-2 sm:hidden">
                        Tiebreaker: {entry.tiebreaker_score}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {entries.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            No entries yet. Admin needs to upload entries.
          </div>
        )}
      </div>

      {prizePlaces > 0 && entries.length > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          Gold bar indicates prize positions ({prizePlaces} prize{prizePlaces !== 1 ? "s" : ""} for {totalEntries} entries)
        </p>
      )}
    </div>
  );
}
