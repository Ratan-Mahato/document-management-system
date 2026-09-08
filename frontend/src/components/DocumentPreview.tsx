"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_EXACT = new Set(["application/json", "application/xml"]);

function isTextMimeType(mimeType: string): boolean {
  return TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p)) || TEXT_MIME_EXACT.has(mimeType);
}

export default function DocumentPreview({ documentId, mimeType }: { documentId: string; mimeType: string | undefined }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUrl(null);
    setText(null);
    try {
      const preview = await api.getPreviewUrl(documentId);
      setUrl(preview.url);
      if (isTextMimeType(preview.mimeType)) {
        const res = await fetch(preview.url);
        setText(await res.text());
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_PREVIEWABLE") {
        setError(null); // not an error state, just nothing to render below
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to load preview");
      }
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not derived state
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="text-sm text-gray-400">Loading preview…</p>
      </div>
    );
  }

  if (error) {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }

  if (!url || !mimeType) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-2xl border border-gray-200 bg-gray-50 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-500">No preview available for this file type.</p>
        <p className="text-xs text-gray-400">Use Download to view it in another app.</p>
      </div>
    );
  }

  if (mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- remote, presigned, expiring URL; next/image's optimizer doesn't apply
    return <img src={url} alt="" className="max-h-[32rem] w-full rounded-2xl border border-gray-200 bg-gray-50 object-contain shadow-sm" />;
  }

  if (mimeType === "application/pdf") {
    return <iframe src={url} title="Document preview" className="h-[32rem] w-full rounded-2xl border border-gray-200 shadow-sm" />;
  }

  if (mimeType.startsWith("video/")) {
    return (
      <video controls className="max-h-[32rem] w-full rounded-2xl border border-gray-200 bg-black shadow-sm">
        <source src={url} type={mimeType} />
      </video>
    );
  }

  if (mimeType.startsWith("audio/")) {
    return (
      <div className="flex h-24 items-center rounded-2xl border border-gray-200 bg-white px-4 shadow-sm">
        <audio controls className="w-full">
          <source src={url} type={mimeType} />
        </audio>
      </div>
    );
  }

  if (text !== null) {
    return (
      <pre className="max-h-[32rem] overflow-auto rounded-2xl border border-gray-200 bg-white p-4 text-xs leading-5 text-gray-700 shadow-sm">
        {text}
      </pre>
    );
  }

  return (
    <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-2xl border border-gray-200 bg-gray-50 text-center shadow-sm">
      <p className="text-sm font-medium text-gray-500">No preview available for this file type.</p>
      <p className="text-xs text-gray-400">Use Download to view it in another app.</p>
    </div>
  );
}
