"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { connectSocket } from "@/lib/socket";
import type { Comment, PresenceUser } from "@/lib/types";
import { useAuth } from "@/lib/AuthProvider";

function renderContentWithMentions(content: string) {
  const parts = content.split(/(@[a-zA-Z0-9._-]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="font-medium text-indigo-600">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function CommentsPanel({ documentId }: { documentId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const joinedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setComments(await api.listComments(documentId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not derived state
    load();
  }, [load]);

  useEffect(() => {
    const socket = connectSocket();

    function join() {
      socket.emit("document:join", documentId, (ok: boolean, err?: string) => {
        if (ok) {
          joinedRef.current = true;
        } else if (err) {
          setError(err);
        }
      });
    }

    if (socket.connected) {
      join();
    } else {
      socket.once("connect", join);
    }

    function onPresence(list: PresenceUser[]) {
      setPresence(list);
    }
    function onNewComment(comment: Comment) {
      setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
    }
    function onUpdatedComment(comment: Comment) {
      setComments((prev) => prev.map((c) => (c.id === comment.id ? comment : c)));
    }
    function onDeletedComment({ id }: { id: string }) {
      setComments((prev) => prev.filter((c) => c.id !== id));
    }

    socket.on("presence:update", onPresence);
    socket.on("comment:new", onNewComment);
    socket.on("comment:updated", onUpdatedComment);
    socket.on("comment:deleted", onDeletedComment);

    return () => {
      socket.off("connect", join);
      socket.off("presence:update", onPresence);
      socket.off("comment:new", onNewComment);
      socket.off("comment:updated", onUpdatedComment);
      socket.off("comment:deleted", onDeletedComment);
      if (joinedRef.current) {
        socket.emit("document:leave", documentId);
        joinedRef.current = false;
      }
      setPresence([]);
    };
  }, [documentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const comment = await api.createComment(documentId, content.trim());
      setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
      setContent("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleResolved(comment: Comment) {
    try {
      const updated = await api.resolveComment(documentId, comment.id, !comment.resolved);
      setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update comment");
    }
  }

  async function handleDelete(comment: Comment) {
    try {
      await api.deleteComment(documentId, comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete comment");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Comments</h2>
        {presence.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Viewing now</span>
            <div className="flex -space-x-1.5">
              {presence.map((p) => (
                <span
                  key={p.userId}
                  title={p.name}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-[10px] font-medium text-white"
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="Add a comment… use @name to mention someone"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
        />
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Post
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {comments.length === 0 && <li className="text-sm text-gray-400">No comments yet.</li>}
          {comments.map((c) => (
            <li
              key={c.id}
              className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${c.resolved ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{c.user.name}</span>
                <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className={c.resolved ? "mt-0.5 text-gray-400 line-through" : "mt-0.5 text-gray-700"}>
                {renderContentWithMentions(c.content)}
              </p>
              <div className="mt-1.5 flex gap-4 text-xs font-medium">
                <button onClick={() => handleToggleResolved(c)} className="text-gray-500 hover:text-indigo-600">
                  {c.resolved ? "Unresolve" : "Resolve"}
                </button>
                {c.userId === user?.id && (
                  <button onClick={() => handleDelete(c)} className="text-gray-500 hover:text-red-600">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
