"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface ClaimEntryProps {
  entries: { id: string; entry_name: string }[];
}

export default function ClaimEntry({ entries }: ClaimEntryProps) {
  const [claiming, setClaiming] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

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

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-3">
        Unclaimed Entries
      </h2>
      <p className="text-sm text-slate-500 mb-3">
        Click &quot;Claim&quot; next to your entry to link it to your account.
      </p>
      <div className="bg-white rounded-lg shadow divide-y">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="text-sm text-slate-800">{entry.entry_name}</span>
            <button
              onClick={() => handleClaim(entry.id)}
              disabled={claiming === entry.id}
              className="text-sm bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {claiming === entry.id ? "Claiming..." : "Claim"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
