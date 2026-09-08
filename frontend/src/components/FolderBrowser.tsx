"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import type { Document, Folder } from "@/lib/types";
import ShareDialog from "./ShareDialog";

const TYPE_FILTERS: { label: string; value: string }[] = [
  { label: "Any type", value: "" },
  { label: "Images", value: "image/" },
  { label: "PDF", value: "application/pdf" },
  { label: "Text", value: "text/" },
  { label: "Video", value: "video/" },
  { label: "Audio", value: "audio/" },
];

const DATE_FILTERS: { label: string; value: string }[] = [
  { label: "Any time", value: "" },
  { label: "Today", value: "1" },
  { label: "This week", value: "7" },
  { label: "This month", value: "30" },
];

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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-gray-400">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function FolderBrowser({ folderId }: { folderId: string | null }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sharingDocument, setSharingDocument] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [dateRange, setDateRange] = useState("");

  const hasActiveFilters = Boolean(q || tag || mimeType || dateRange);
  const currentFolderName = breadcrumbs.at(-1)?.name ?? "My Drive";
  useDocumentTitle(currentFolderName);

  useEffect(() => {
    const handle = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const updatedAfter = dateRange
        ? new Date(Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const [folderList, documentList] = await Promise.all([
        api.listFolders(folderId),
        api.listDocuments({ folderId, q: q || undefined, tag: tag || undefined, mimeType: mimeType || undefined, updatedAfter }),
      ]);
      setFolders(folderList);
      setDocuments(documentList);

      const trail: Folder[] = [];
      let currentId = folderId;
      while (currentId) {
        const f = await api.getFolder(currentId);
        trail.unshift(f);
        currentId = f.parentId;
      }
      setBreadcrumbs(trail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load this folder");
    } finally {
      setLoading(false);
    }
  }, [folderId, q, tag, mimeType, dateRange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/navigation, not derived state
    load();
  }, [load]);

  async function handleCreateFolder() {
    const name = window.prompt("Folder name");
    if (!name) return;
    try {
      await api.createFolder(name, folderId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create folder");
    }
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const { uploadUrl, s3Key } = await api.presignUpload(file.name, file.type || "application/octet-stream", file.size, folderId);
        await api.uploadToPresignedUrl(uploadUrl, file);
        await api.createDocument({
          name: file.name,
          folderId,
          tags: [],
          s3Key,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRenameFolder(folder: Folder) {
    const name = window.prompt("Rename folder", folder.name);
    if (!name || name === folder.name) return;
    try {
      await api.renameFolder(folder.id, name);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename folder");
    }
  }

  async function handleDeleteFolder(folder: Folder) {
    if (!window.confirm(`Delete folder "${folder.name}"?`)) return;
    try {
      await api.deleteFolder(folder.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete folder");
    }
  }

  async function handleRenameDocument(doc: Document) {
    const name = window.prompt("Rename document", doc.name);
    if (!name || name === doc.name) return;
    try {
      await api.renameDocument(doc.id, name);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename document");
    }
  }

  async function handleDeleteDocument(doc: Document) {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    try {
      await api.deleteDocument(doc.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete document");
    }
  }

  async function handleDownload(doc: Document) {
    try {
      const url = await api.getDownloadUrl(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate download link");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        {breadcrumbs.length > 0 && (
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-sm text-gray-400">
            <Link href="/drive" className="transition hover:text-indigo-600">
              My Drive
            </Link>
            {breadcrumbs.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <span>/</span>
                <Link href={`/drive/${f.id}`} className="transition hover:text-indigo-600">
                  {f.name}
                </Link>
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{currentFolderName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCreateFolder}
              className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              New folder
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload files"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search name or content…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border-0 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 transition placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <input
          type="text"
          placeholder="Tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="w-28 rounded-lg border-0 bg-gray-50 px-3 py-2 text-sm text-gray-900 transition placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <select
          value={mimeType}
          onChange={(e) => setMimeType(e.target.value)}
          className="rounded-lg border-0 bg-gray-50 px-2.5 py-2 text-sm text-gray-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-lg border-0 bg-gray-50 px-2.5 py-2 text-sm text-gray-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {DATE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearchInput("");
              setQ("");
              setTag("");
              setMimeType("");
              setDateRange("");
            }}
            className="px-2 text-xs font-medium text-gray-500 hover:text-indigo-600"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {folders.length === 0 && documents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path
                    d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="text-sm font-medium text-gray-500">
                {hasActiveFilters ? "No documents match your search." : "This folder is empty."}
              </p>
              {!hasActiveFilters && <p className="text-xs text-gray-400">Upload a file or create a folder to get started.</p>}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {!hasActiveFilters &&
                folders.map((folder) => (
                  <li key={folder.id} className="group flex items-center justify-between px-4 py-3 transition hover:bg-gray-50">
                    <Link href={`/drive/${folder.id}`} className="flex min-w-0 items-center gap-3">
                      <FolderIcon />
                      <span className="truncate font-medium text-gray-900">{folder.name}</span>
                    </Link>
                    <div className="flex shrink-0 gap-4 text-xs font-medium text-gray-400 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => handleRenameFolder(folder)} className="hover:text-indigo-600">
                        Rename
                      </button>
                      <button onClick={() => handleDeleteFolder(folder)} className="hover:text-red-600">
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              {documents.map((doc) => (
                <li key={doc.id} className="group flex items-center justify-between px-4 py-3 transition hover:bg-gray-50">
                  <Link href={`/drive/documents/${doc.id}`} className="flex min-w-0 items-center gap-3">
                    <DocumentIcon />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{doc.name}</p>
                      <p className="truncate text-xs text-gray-400">
                        {doc.currentVersion ? formatBytes(doc.currentVersion.size) : "no content"} ·{" "}
                        {new Date(doc.updatedAt).toLocaleString()}
                        {doc.tags.length > 0 ? ` · ${doc.tags.join(", ")}` : ""}
                      </p>
                    </div>
                  </Link>
                  <div className="flex shrink-0 gap-4 text-xs font-medium text-gray-400 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => handleDownload(doc)} className="hover:text-indigo-600">
                      Download
                    </button>
                    <button onClick={() => setSharingDocument(doc)} className="hover:text-indigo-600">
                      Share
                    </button>
                    <button onClick={() => handleRenameDocument(doc)} className="hover:text-indigo-600">
                      Rename
                    </button>
                    <button onClick={() => handleDeleteDocument(doc)} className="hover:text-red-600">
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sharingDocument && (
        <ShareDialog
          documentId={sharingDocument.id}
          documentName={sharingDocument.name}
          onClose={() => setSharingDocument(null)}
        />
      )}
    </div>
  );
}
