"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import Logo from "@/components/Logo";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const isAdmin = user?.systemRole === "ADMIN";

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!isAdmin) {
      router.replace("/drive");
    }
  }, [loading, user, isAdmin, router]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="flex items-center justify-between px-[1cm] py-3">
          <div className="flex items-center gap-3">
            <Link href="/drive" className="transition hover:opacity-80">
              <Logo />
            </Link>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/drive"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Back to Drive
            </Link>
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
        <nav className="flex gap-1 px-[1cm] pb-2 text-sm">
          <Link
            href="/admin"
            className="rounded-lg px-3 py-1.5 font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
          >
            Users
          </Link>
          <Link
            href="/admin/audit-log"
            className="rounded-lg px-3 py-1.5 font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
          >
            Audit log
          </Link>
        </nav>
      </header>
      <main className="w-full flex-1 px-[1cm] py-8">{children}</main>
    </div>
  );
}
