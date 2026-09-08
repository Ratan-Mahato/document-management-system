"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/types";

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
};

interface FieldChange {
  from: unknown;
  to: unknown;
}

function folderLabel(value: unknown): string {
  if (!value || typeof value !== "object") return "My Drive (root)";
  const v = value as { name?: string };
  return v.name ? `"${v.name}"` : "a folder";
}

function describeChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== "object") return [];
  const entries = Object.entries(changes as Record<string, FieldChange>);
  return entries.map(([field, change]) => {
    if (field === "name") {
      return `renamed "${String(change.from)}" → "${String(change.to)}"`;
    }
    if (field === "folder" || field === "parent") {
      return `moved from ${folderLabel(change.from)} to ${folderLabel(change.to)}`;
    }
    if (field === "tags") {
      const to = Array.isArray(change.to) ? change.to.join(", ") : String(change.to);
      return to ? `tags set to ${to}` : "tags cleared";
    }
    return `${field} changed`;
  });
}

function describeAuditLog(log: AuditLogEntry): string | null {
  const m = (log.metadata ?? {}) as Record<string, unknown>;
  const name = (m.name as string | undefined) ?? (m.documentName as string | undefined) ?? (m.folderName as string | undefined);
  const versionNumber = m.versionNumber as number | undefined;

  switch (log.action) {
    case "CREATE":
      return name ? `Created "${name}"` : null;
    case "VIEW":
      return name ? `Viewed "${name}"` : null;
    case "DELETE":
      return name ? `Deleted "${name}"` : null;
    case "DOWNLOAD":
      return name ? `Downloaded "${name}"${versionNumber ? ` (v${versionNumber})` : ""}` : null;
    case "UPLOAD_VERSION":
      return `Uploaded${versionNumber ? ` version ${versionNumber}` : " a new version"}${name ? ` of "${name}"` : ""}`;
    case "UPDATE": {
      const parts = describeChanges(m.changes);
      return parts.length > 0 ? parts.join("; ") : null;
    }
    case "SHARE": {
      const targetName = m.targetName as string | undefined;
      const targetEmail = m.targetEmail as string | undefined;
      const role = m.role as string | undefined;
      return targetName ? `Granted ${targetName} (${targetEmail}) ${role} access` : null;
    }
    case "UNSHARE": {
      const targetName = m.targetName as string | undefined;
      const targetEmail = m.targetEmail as string | undefined;
      const priorRole = m.priorRole as string | undefined;
      return targetName ? `Removed ${targetName} (${targetEmail})'s ${priorRole ?? ""} access` : null;
    }
    case "COMMENT": {
      const preview = m.preview as string | undefined;
      const mentions = m.mentions as string[] | undefined;
      if (!preview) return null;
      return `"${preview}"${mentions && mentions.length > 0 ? ` — mentioned @${mentions.join(", @")}` : ""}`;
    }
    default:
      return null;
  }
}

export default function AuditLogPanel({ documentId }: { documentId: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await api.getDocumentAuditLog(documentId));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "Only editors and the owner can view the activity log."
          : err instanceof ApiError
            ? err.message
            : "Failed to load activity log"
      );
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not derived state
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
        <button onClick={load} disabled={loading} className="text-xs font-medium text-gray-400 hover:text-indigo-600 disabled:opacity-50">
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {!loading && error && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">{error}</p>}

      {!loading && !error && (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm">
          {logs.length === 0 && <li className="p-6 text-center text-sm text-gray-400">No activity recorded yet.</li>}
          {logs.map((log) => {
            const description = describeAuditLog(log);
            return (
              <li key={log.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <span className="shrink-0 font-medium text-gray-900">{log.user?.name ?? "Unknown user"}</span>
                  {description && <span className="truncate text-gray-500">{description}</span>}
                </span>
                <span className="shrink-0 text-xs text-gray-400">
                  {new Date(log.createdAt).toLocaleString()}
                  {log.ipAddress ? ` · ${log.ipAddress}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
