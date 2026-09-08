"use client";

import { useEffect } from "react";

const SUFFIX = "SmartDocs";

/**
 * Set document.title for client-rendered pages that can't export Next metadata.
 * Pass null while a title is still loading to leave the current title untouched.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title === null) return;
    document.title = title ? `${title} — ${SUFFIX}` : SUFFIX;
  }, [title]);
}
