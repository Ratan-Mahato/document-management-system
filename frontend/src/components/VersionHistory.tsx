"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { diffLines, type Change } from "diff";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { Document, DocumentVersion } from "@/lib/types";

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_EXACT = new Set(["application/json", "application/xml"]);

function isTextMimeType(mimeType: string): boolean {
  return TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p)) || TEXT_MIME_EXACT.has(mimeType);
}

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

export default function VersionHistory({
  document,
  onDocumentChanged,
}: {
  document: Document;
  onDocumentChanged: () => void;
}) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [diffParts, setDiffParts] = useState<Change[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVersions(await api.listDocumentVersions(document.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load version history");
    } finally {
      setLoading(false);
    }
  }, [document.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not derived state
    load();
  }, [load]);

  async function handleUploadNewVersion(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { uploadUrl, s3Key } = await api.presignVersionUpload(document.id, file.name, file.type || "application/octet-stream", file.size);
      await api.uploadToPresignedUrl(uploadUrl, file);
      await api.addDocumentVersion(document.id, {
        s3Key,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
      });
      await load();
      onDocumentChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload new version");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownloadVersion(version: DocumentVersion) {
    try {
      const url = await api.getVersionDownloadUrl(document.id, version.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate download link");
    }
  }

  function toggleSelect(versionId: string) {
    setDiffParts(null);
    setSelected((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      if (prev.length >= 2) return [prev[1], versionId];
      return [...prev, versionId];
    });
  }

  async function handleCompare() {
    if (selected.length !== 2) return;
    setDiffLoading(true);
    setError(null);
    try {
      const [a, b] = [...selected].sort(
        (x, y) => (versions.find((v) => v.id === x)?.versionNumber ?? 0) - (versions.find((v) => v.id === y)?.versionNumber ?? 0)
      );
      const [oldText, newText] = await Promise.all([api.getVersionText(document.id, a), api.getVersionText(document.id, b)]);
      setDiffParts(diffLines(oldText, newText));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to compare versions");
    } finally {
      setDiffLoading(false);
    }
  }

  const canDiff =
    selected.length === 2 &&
    selected.every((id) => {
      const v = versions.find((ver) => ver.id === id);
      return v && isTextMimeType(v.mimeType);
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Version history</h2>
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload new version"}
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleUploadNewVersion(e.target.files)} />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {selected.length === 2 && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5 text-xs text-indigo-900">
          <span>
            Comparing v{versions.find((v) => v.id === selected[0])?.versionNumber} and v
            {versions.find((v) => v.id === selected[1])?.versionNumber}
          </span>
          <button
            onClick={handleCompare}
            disabled={!canDiff || diffLoading}
            className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {diffLoading ? "Comparing…" : "Compare"}
          </button>
          {!canDiff && <span className="text-amber-600">Diffing only works for text-based files.</span>}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between px-4 py-3 text-sm transition hover:bg-gray-50">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.includes(v.id)}
                  onChange={() => toggleSelect(v.id)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="font-medium text-gray-900">v{v.versionNumber}</span>{" "}
                  {v.id === document.currentVersionId && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">current</span>
                  )}
                  <span className="ml-2 text-gray-400">
                    {formatBytes(v.size)} · {v.createdBy?.name ?? "Unknown"} · {new Date(v.createdAt).toLocaleString()}
                  </span>
                </span>
              </label>
              <button onClick={() => handleDownloadVersion(v)} className="text-xs font-medium text-gray-400 hover:text-indigo-600">
                Download
              </button>
            </li>
          ))}
        </ul>
      )}

      {diffParts && (
        <pre className="max-h-96 overflow-auto rounded-2xl border border-gray-200 bg-white p-4 text-xs leading-5 shadow-sm">
          {diffParts.map((part, i) => (
            <div
              key={i}
              className={
                part.added
                  ? "bg-emerald-50 text-emerald-800"
                  : part.removed
                    ? "bg-red-50 text-red-800"
                    : "text-gray-600"
              }
            >
              {part.value
                .split("\n")
                .filter((_, idx, arr) => !(idx === arr.length - 1 && part.value.endsWith("\n")))
                .map((line, j) => (
                  <div key={j}>
                    {part.added ? "+ " : part.removed ? "- " : "  "}
                    {line}
                  </div>
                ))}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
