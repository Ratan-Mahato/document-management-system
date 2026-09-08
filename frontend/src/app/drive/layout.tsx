"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import Logo from "@/components/Logo";
import NotificationBell from "@/components/NotificationBell";
import ChangePasswordButton from "@/components/ChangePasswordButton";

export default function DriveLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="flex items-center justify-between px-[1cm] py-3">
          <Link href="/drive" className="transition hover:opacity-80">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {user.systemRole === "ADMIN" && (
              <Link
                href="/admin"
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-100"
              >
                Admin
              </Link>
            )}
            <Link
              href="/drive/trash"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Trash
            </Link>
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                {initials}
              </span>
              <span className="text-gray-700">{user.name}</span>
            </div>
            <ChangePasswordButton />
            <button
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="w-full flex-1 px-[1cm] py-8">{children}</main>
    </div>
  );
}
