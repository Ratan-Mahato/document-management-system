"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import type { AdminUser } from "@/lib/types";

export default function AdminUsersPage() {
  useDocumentTitle("Users");
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "deactivated">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { users: list } = await api.adminListUsers({ q: q || undefined, status });
      setUsers(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/search, not derived state
    load();
  }, [load]);

  async function handleToggleRole(target: AdminUser) {
    const nextRole = target.systemRole === "ADMIN" ? "USER" : "ADMIN";
    if (nextRole === "USER" && !window.confirm(`Remove admin access from ${target.name}?`)) return;
    setBusyId(target.id);
    setError(null);
    try {
      const updated = await api.adminSetUserRole(target.id, nextRole);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(target: AdminUser) {
    if (
      !window.confirm(
        `Reset password for ${target.name}? A new temporary password will be generated and all their sessions signed out.`
      )
    )
      return;
    setBusyId(target.id);
    setError(null);
    try {
      const { generatedPassword } = await api.adminResetUserPassword(target.id);
      if (generatedPassword) {
        setCopied(false);
        setResetResult({ name: target.name, email: target.email, password: generatedPassword });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActivation(target: AdminUser) {
    const deactivate = target.deactivatedAt === null;
    if (deactivate && !window.confirm(`Deactivate ${target.name}? They will be signed out immediately.`)) return;
    setBusyId(target.id);
    setError(null);
    try {
      const updated = await api.adminSetUserActivation(target.id, deactivate);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update account status");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">Manage administrator access and account status.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full max-w-sm flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
          {(["all", "active", "deactivated"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                status === s
                  ? "rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium capitalize text-white"
                  : "rounded-md px-3 py-1.5 text-xs font-medium capitalize text-gray-600 transition hover:bg-gray-100"
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {resetResult && mounted &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResetResult(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">Temporary password</h2>
            <p className="mt-1 text-sm text-gray-500">
              Share this with <span className="font-medium text-gray-700">{resetResult.name}</span> (
              {resetResult.email}). It won&apos;t be shown again. All their sessions were signed out.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900">
                {resetResult.password}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(resetResult.password);
                  setCopied(true);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setResetResult(null)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
          document.body
        )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-gray-400">
          {status === "deactivated"
            ? "No deactivated users."
            : status === "active"
              ? "No active users match."
              : "No users found."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Owned</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const deactivated = u.deactivatedAt !== null;
                return (
                  <tr key={u.id} className={deactivated ? "bg-gray-50/60" : ""}>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">
                          {u.name}
                          {isSelf && <span className="ml-2 text-xs font-normal text-gray-400">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-gray-400">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.systemRole === "ADMIN"
                            ? "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700"
                            : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                        }
                      >
                        {u.systemRole}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          deactivated
                            ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                            : "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                        }
                      >
                        {deactivated ? "Deactivated" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {u._count ? `${u._count.ownedDocuments} docs · ${u._count.ownedFolders} folders` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleToggleRole(u)}
                          disabled={busyId === u.id || (isSelf && u.systemRole === "ADMIN")}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {u.systemRole === "ADMIN" ? "Revoke admin" : "Make admin"}
                        </button>
                        <button
                          onClick={() => handleResetPassword(u)}
                          disabled={busyId === u.id}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Reset password
                        </button>
                        <button
                          onClick={() => handleToggleActivation(u)}
                          disabled={busyId === u.id || isSelf}
                          className={
                            deactivated
                              ? "rounded-lg border border-green-300 bg-white px-2.5 py-1 text-xs font-medium text-green-700 shadow-sm transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
                              : "rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          }
                        >
                          {deactivated ? "Reactivate" : "Deactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
