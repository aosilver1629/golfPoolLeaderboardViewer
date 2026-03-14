"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  unclaimedEntries: { id: string; entry_name: string }[];
}

const pickTypeLabel: Record<string, string> = {
  group_a: "A",
  group_b: "B",
  group_c: "C",
  group_d: "D",
  wildcard: "WC",
};

const pickOrder = ["group_a", "group_b", "group_c", "group_d", "wildcard"];

function PicksGrid({ picks }: { picks: EntryPick[] }) {
  return (
    <div className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3">
        {picks
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
                <span className="text-xs text-slate-500">{pick.current_position || "-"}</span>
                <span className="font-semibold text-slate-700">{pick.current_points}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function LeaderboardTable({
  entries,
  currentUserId,
  poolId,
  isAdmin,
  totalEntries,
  unclaimedEntries,
}: LeaderboardTableProps) {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [claimBannerOpen, setClaimBannerOpen] = useState(true);
  const [claimSearch, setClaimSearch] = useState("");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [unclaiming, setUnclaiming] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const prizePlaces = Math.floor(totalEntries / 17) || 1;
  const myEntries = entries.filter((e) => e.user_id === currentUserId);

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

  async function handleClaim(entryId: string) {
    setClaiming(entryId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("entries")
      .update({ user_id: user.id })
      .eq("id", entryId)
      .is("user_id", null);
    if (error) {
      alert("Failed to claim entry. It may have already been claimed.");
    } else {
      router.refresh();
    }
    setClaiming(null);
  }

  async function handleUnclaim(entryId: string) {
    setUnclaiming(entryId);
    const { error } = await supabase
      .from("entries")
      .update({ user_id: null })
      .eq("id", entryId)
      .eq("user_id", currentUserId);
    if (error) {
      alert("Failed to unclaim entry.");
    } else {
      router.refresh();
    }
    setUnclaiming(null);
  }

  function toggleExpand(id: string) {
    setExpandedEntry((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      {/* Admin sync button */}
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

      {/* Claim banner */}
      {unclaimedEntries.length > 0 && claimBannerOpen && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                {myEntries.length === 0 ? "Haven't claimed your entry yet?" : "Claim another entry"}
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                Search for your name to claim your entry.
              </p>
              <input
                type="text"
                placeholder="Search entries..."
                value={claimSearch}
                onChange={(e) => setClaimSearch(e.target.value)}
                className="mt-3 w-full px-3 py-2 text-sm border border-green-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              {claimSearch.trim() && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {unclaimedEntries
                    .filter((e) =>
                      e.entry_name.toLowerCase().includes(claimSearch.toLowerCase())
                    )
                    .map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-green-100">
                        <span className="text-sm text-slate-800">{entry.entry_name}</span>
                        <button
                          onClick={() => handleClaim(entry.id)}
                          disabled={claiming === entry.id}
                          className="text-xs bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 disabled:opacity-50 font-medium flex-shrink-0 ml-3"
                        >
                          {claiming === entry.id ? "Claiming..." : "Claim"}
                        </button>
                      </div>
                    ))}
                  {unclaimedEntries.filter((e) =>
                    e.entry_name.toLowerCase().includes(claimSearch.toLowerCase())
                  ).length === 0 && (
                    <p className="text-xs text-slate-500 px-1 py-2">No entries match &quot;{claimSearch}&quot;</p>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setClaimBannerOpen(false)}
              className="text-green-600 hover:text-green-800 text-lg leading-none flex-shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* My Entries pinned section */}
      {myEntries.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-500 text-base">★</span>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">My Entries</h2>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden divide-y divide-slate-100">
            {myEntries.map((entry) => {
              const isExpanded = expandedEntry === `pinned-${entry.id}`;
              const isPrizePosition = (entry.rank || 0) <= prizePlaces;
              return (
                <div
                  key={entry.id}
                  className={`bg-green-50 ${isPrizePosition ? "border-l-4 border-l-yellow-400" : "border-l-4 border-l-green-400"}`}
                >
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleExpand(`pinned-${entry.id}`)}
                      className="flex-1 text-left hover:bg-green-100 transition-colors min-w-0"
                    >
                      <div className="flex items-center">
                        <div className="px-3 py-3 w-14 flex-shrink-0 text-sm font-semibold text-slate-700">
                          #{entry.rank || "-"}
                        </div>
                        <div className="px-3 py-3 flex-1 min-w-0">
                          <span className="text-sm font-medium text-green-800 truncate block">
                            {entry.entry_name}
                          </span>
                        </div>
                        <div className="px-3 py-3 text-right w-20 flex-shrink-0">
                          <span className="text-sm font-bold text-slate-900">
                            {Math.round(entry.total_points)}
                          </span>
                        </div>
                        <div className="px-3 py-3 text-center w-16 flex-shrink-0 hidden sm:block">
                          <span className="text-sm text-slate-500">{entry.tiebreaker_score || "-"}</span>
                        </div>
                        <div className="px-3 py-3 w-8 flex-shrink-0 text-slate-400 text-xs">
                          {isExpanded ? "▲" : "▼"}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleUnclaim(entry.id)}
                      disabled={unclaiming === entry.id}
                      className="px-3 py-3 text-xs text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors flex-shrink-0"
                      title="Unclaim entry"
                    >
                      {unclaiming === entry.id ? "..." : "✕"}
                    </button>
                  </div>
                  {isExpanded && <PicksGrid picks={entry.entry_picks} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full leaderboard */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Header */}
        <div className="bg-green-700 text-white text-sm flex items-center">
          <div className="px-3 py-3 w-14 flex-shrink-0 font-medium">Rank</div>
          <div className="px-3 py-3 flex-1 font-medium min-w-0">Entry</div>
          <div className="px-3 py-3 text-right w-20 flex-shrink-0 font-medium">Points</div>
          <div className="px-3 py-3 text-center w-16 flex-shrink-0 font-medium hidden sm:block">TB</div>
          <div className="w-8 flex-shrink-0" />
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
                  onClick={() => toggleExpand(entry.id)}
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
                    <div className="px-3 py-3 w-8 flex-shrink-0 text-slate-400 text-xs">
                      {isExpanded ? "▲" : "▼"}
                    </div>
                  </div>
                </button>

                {isExpanded && <PicksGrid picks={entry.entry_picks} />}
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
