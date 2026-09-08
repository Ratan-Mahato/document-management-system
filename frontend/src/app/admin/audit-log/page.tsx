"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { AuditAction, AuditLogEntry } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  REGISTER: "Registered",
  VIEW: "Viewed",
  DOWNLOAD: "Downloaded",
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  RESTORE: "Restored",
  UPLOAD_VERSION: "Uploaded version",
  SHARE: "Shared",
  UNSHARE: "Removed access",
  COMMENT: "Commented",
  PROMOTE: "Promoted to admin",
  DEMOTE: "Removed admin",
  DEACTIVATE: "Deactivated account",
  REACTIVATE: "Reactivated account",
  PASSWORD_RESET: "Reset password",
  PASSWORD_CHANGE: "Changed password",
};

const ACTION_FILTERS: { label: string; value: string }[] = [
  { label: "All actions", value: "" },
  { label: "Sign in", value: "LOGIN" },
  { label: "Sign out", value: "LOGOUT" },
  { label: "Register", value: "REGISTER" },
  { label: "View", value: "VIEW" },
  { label: "Download", value: "DOWNLOAD" },
  { label: "Create", value: "CREATE" },
  { label: "Update", value: "UPDATE" },
  { label: "Delete", value: "DELETE" },
  { label: "Restore", value: "RESTORE" },
  { label: "Upload version", value: "UPLOAD_VERSION" },
  { label: "Share", value: "SHARE" },
  { label: "Remove access", value: "UNSHARE" },
  { label: "Comment", value: "COMMENT" },
  { label: "Promote", value: "PROMOTE" },
  { label: "Demote", value: "DEMOTE" },
  { label: "Deactivate", value: "DEACTIVATE" },
  { label: "Reactivate", value: "REACTIVATE" },
  { label: "Reset password", value: "PASSWORD_RESET" },
  { label: "Change password", value: "PASSWORD_CHANGE" },
];

function describeMetadata(log: AuditLogEntry): string | null {
  const m = (log.metadata ?? {}) as Record<string, unknown>;
  const name =
    (m.name as string | undefined) ??
    (m.documentName as string | undefined) ??
    (m.folderName as string | undefined);
  const targetEmail = m.targetEmail as string | undefined;

  if (targetEmail) {
    const role = m.role as string | undefined;
    return role ? `${targetEmail} (${role})` : targetEmail;
  }
  if (name) return `"${name}"`;
  if (log.resourceType && log.resourceId) return `${log.resourceType.toLowerCase()} ${log.resourceId.slice(0, 8)}…`;
  return null;
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { logs: list, total: count } = await api.adminListAuditLog({
        action: (action || undefined) as AuditAction | undefined,
      });
      setLogs(list);
      setTotal(count);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/filter, not derived state
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Audit log</h1>
          <p className="mt-1 text-sm text-gray-500">
            System-wide activity{total > 0 ? ` · showing ${logs.length} of ${total}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400">No activity recorded.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.user ? (
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{log.user.name}</p>
                        <p className="truncate text-xs text-gray-400">{log.user.email}</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{describeMetadata(log) ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{log.ipAddress ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
