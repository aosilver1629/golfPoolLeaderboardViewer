"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

interface UserProfile {
  display_name: string;
  is_admin: boolean;
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("display_name, is_admin")
          .eq("id", user.id)
          .single();
        if (data) setProfile(data);
      }
    }
    loadProfile();
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const navLinks = [
    { href: "/", label: "Leaderboard" },
    { href: "/my-entries", label: "My Entries" },
    { href: "/join", label: "Join Pool" },
  ];

  return (
    <nav className="bg-green-700 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center space-x-6">
            <Link href="/" className="font-bold text-lg">
              Golf Pool
            </Link>
            <div className="hidden sm:flex space-x-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? "bg-green-800 text-white"
                      : "text-green-100 hover:bg-green-600"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {profile?.is_admin && (
                <Link
                  href="/admin"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname.startsWith("/admin")
                      ? "bg-green-800 text-white"
                      : "text-green-100 hover:bg-green-600"
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {profile && (
              <span className="text-sm text-green-100 hidden sm:inline">
                {profile.display_name}
              </span>
            )}
            <button
              onClick={handleSignOut}
              className="text-sm text-green-100 hover:text-white px-3 py-1 rounded-md hover:bg-green-600 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden pb-2 flex space-x-1 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                pathname === link.href
                  ? "bg-green-800 text-white"
                  : "text-green-100 hover:bg-green-600"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {profile?.is_admin && (
            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                pathname.startsWith("/admin")
                  ? "bg-green-800 text-white"
                  : "text-green-100 hover:bg-green-600"
              }`}
            >
              Admin
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
