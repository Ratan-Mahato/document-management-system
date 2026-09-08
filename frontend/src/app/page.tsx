"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import Logo from "@/components/Logo";

const FEATURES: { title: string; description: string; icon: React.ReactNode }[] = [
  {
    title: "Version history",
    description: "Every upload is an immutable version. Roll back, download any prior copy, or diff two text versions line by line.",
    icon: (
      <path
        d="M12 8v4l3 2M12 21a9 9 0 1 0-9-9c0 2.5 1 4.5 2.5 6.2L3 21l3-1a9 9 0 0 0 6 1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Granular access control",
    description: "Owner, Editor, Commenter, and Viewer roles per folder or document, inherited down the folder tree and shareable by email.",
    icon: (
      <path
        d="M12 3 4 6.5v5c0 4.6 3.2 8.9 8 10 4.8-1.1 8-5.4 8-10v-5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Real-time collaboration",
    description: "See who's viewing a document right now and discuss it together with live, threaded @mention comments.",
    icon: (
      <path
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.4-4 8-9 8a10 10 0 0 1-3.5-.6L3 21l1.7-4A7.8 7.8 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Encryption & audit logs",
    description: "Files are encrypted at rest and served only via short-lived signed URLs. Every view, edit, share, and download is logged.",
    icon: (
      <path
        d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5l-8-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Advanced search & tagging",
    description: "Full-text search across file names and content, filterable by tag, file type, owner, and when it was last touched.",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
        <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "Direct-to-storage uploads",
    description: "Files stream straight from your browser to S3-compatible storage via pre-signed URLs — never through the app server.",
    icon: (
      <path
        d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/drive");
    }
  }, [loading, user, router]);

  if (loading || user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Logo size="lg" />
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="flex items-center justify-between px-[1cm] py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-indigo-600">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden px-[1cm] pb-20 pt-20 text-center sm:pt-28">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-200 via-violet-200 to-transparent opacity-60 blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl">
            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              Secure document management
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
              Store, share, and collaborate on documents — securely.
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Version history, fine-grained permissions, real-time comments, and full-text search — all in one place, backed by
              encrypted cloud storage.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700"
              >
                Get started for free
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="px-[1cm] pb-24">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                    {feature.icon}
                  </svg>
                </span>
                <h3 className="mt-4 font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 px-[1cm] py-6 text-center text-sm text-gray-400">
        SmartDocs — built as a demonstration of secure, cloud-based document management.
      </footer>
    </div>
  );
}
