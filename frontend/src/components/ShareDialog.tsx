"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { Permission, Role } from "@/lib/types";

const ROLES: Role[] = ["VIEWER", "COMMENTER", "EDITOR", "OWNER"];

export default function ShareDialog({
  documentId,
  documentName,
  onClose,
}: {
  documentId: string;
  documentName: string;
  onClose: () => void;
}) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPermissions(await api.listDocumentPermissions(documentId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load permissions");
    }
  }, [documentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not derived state
    refresh();
  }, [refresh]);

  async function onGrant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await api.lookupUserByEmail(email);
      await api.grantDocumentPermission(documentId, user.id, role);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to share document");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(permissionId: string) {
    setError(null);
    try {
      await api.revokeDocumentPermission(documentId, permissionId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove access");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-2xl shadow-gray-900/20">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Share &ldquo;{documentName}&rdquo;</h2>
            <p className="mt-0.5 text-sm text-gray-500">Grant access by email.</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onGrant} className="flex gap-2">
          <input
            type="email"
            required
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {permissions.length === 0 && <li className="text-sm text-gray-400">Not shared with anyone yet.</li>}
          {permissions.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-gray-900">{p.user.name}</p>
                <p className="text-gray-500">{p.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{p.role}</span>
                <button onClick={() => onRevoke(p.id)} className="text-xs font-medium text-gray-400 hover:text-red-600">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
