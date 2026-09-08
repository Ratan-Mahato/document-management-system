"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { Document, Folder } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function FolderIcon() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function DocumentIcon() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function TrashPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [folderList, documentList] = await Promise.all([
        api.listDeletedFolders(),
        api.listDeletedDocuments(),
      ]);
      setFolders(folderList);
      setDocuments(documentList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load trash");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not derived state
    load();
  }, [load]);

  async function handleRestoreFolder(folder: Folder) {
    setRestoringId(folder.id);
    setError(null);
    try {
      await api.restoreFolder(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore folder");
    } finally {
      setRestoringId(null);
    }
  }

  async function handleRestoreDocument(doc: Document) {
    setRestoringId(doc.id);
    setError(null);
    try {
      await api.restoreDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore document");
    } finally {
      setRestoringId(null);
    }
  }

  const isEmpty = folders.length === 0 && documents.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-1 flex flex-wrap items-center gap-1 text-sm text-gray-400">
          <Link href="/drive" className="transition hover:text-indigo-600">
            My Drive
          </Link>
          <span>/</span>
          <span className="text-gray-500">Trash</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Trash</h1>
        <p className="mt-1 text-sm text-gray-500">
          Items you&apos;ve deleted. Restore an item to move it back to your Drive.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {isEmpty ? (
            <div className="flex flex-col items-center gap-2 p-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path
                    d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="text-sm font-medium text-gray-500">Trash is empty.</p>
              <p className="text-xs text-gray-400">Deleted files and folders you own will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {folders.map((folder) => (
                <li key={folder.id} className="group flex items-center justify-between px-4 py-3 transition hover:bg-gray-50">
                  <div className="flex min-w-0 items-center gap-3">
                    <FolderIcon />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{folder.name}</p>
                      {folder.deletedAt && (
                        <p className="truncate text-xs text-gray-400">
                          Deleted {new Date(folder.deletedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreFolder(folder)}
                    disabled={restoringId === folder.id}
                    className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoringId === folder.id ? "Restoring…" : "Restore"}
                  </button>
                </li>
              ))}
              {documents.map((doc) => (
                <li key={doc.id} className="group flex items-center justify-between px-4 py-3 transition hover:bg-gray-50">
                  <div className="flex min-w-0 items-center gap-3">
                    <DocumentIcon />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{doc.name}</p>
                      <p className="truncate text-xs text-gray-400">
                        {doc.currentVersion ? formatBytes(doc.currentVersion.size) : "no content"}
                        {doc.deletedAt ? ` · Deleted ${new Date(doc.deletedAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreDocument(doc)}
                    disabled={restoringId === doc.id}
                    className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoringId === doc.id ? "Restoring…" : "Restore"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
