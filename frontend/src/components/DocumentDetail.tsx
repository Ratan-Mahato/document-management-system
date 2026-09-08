"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { Document } from "@/lib/types";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import ShareDialog from "./ShareDialog";
import VersionHistory from "./VersionHistory";
import CommentsPanel from "./CommentsPanel";
import AuditLogPanel from "./AuditLogPanel";
import DocumentPreview from "./DocumentPreview";

type Tab = "preview" | "versions" | "comments" | "activity";

const TABS: { key: Tab; label: string }[] = [
  { key: "preview", label: "Preview" },
  { key: "versions", label: "Versions" },
  { key: "comments", label: "Comments" },
  { key: "activity", label: "Activity" },
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

export default function DocumentDetail({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("preview");
  const [sharing, setSharing] = useState(false);
  useDocumentTitle(doc?.name ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDoc(await api.getDocument(documentId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load document");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not derived state
    load();
  }, [load]);

  async function handleDownload() {
    if (!doc) return;
    try {
      const url = await api.getDownloadUrl(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate download link");
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;
  if (error || !doc) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error ?? "Document not found"}</p>;

  return (
    <div className="space-y-6">
      <Link
        href={doc.folderId ? `/drive/${doc.folderId}` : "/drive"}
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-indigo-600"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-gray-900">{doc.name}</h1>
            <p className="text-sm text-gray-400">
              {doc.currentVersion ? formatBytes(doc.currentVersion.size) : "no content"} ·{" "}
              {doc.currentVersion?.mimeType} · updated {new Date(doc.updatedAt).toLocaleString()}
            </p>
            {doc.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {doc.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={handleDownload}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Download
          </button>
          <button
            onClick={() => setSharing(true)}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700"
          >
            Share
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 text-sm">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 px-1 py-2.5 font-medium transition ${
                tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "preview" && <DocumentPreview documentId={doc.id} mimeType={doc.currentVersion?.mimeType} />}
      {tab === "versions" && <VersionHistory document={doc} onDocumentChanged={load} />}
      {tab === "comments" && <CommentsPanel documentId={doc.id} />}
      {tab === "activity" && <AuditLogPanel documentId={doc.id} />}

      {sharing && <ShareDialog documentId={doc.id} documentName={doc.name} onClose={() => setSharing(false)} />}
    </div>
  );
}
