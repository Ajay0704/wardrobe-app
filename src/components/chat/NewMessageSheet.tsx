"use client";

import { Check, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createConversation, searchUsers, type SearchUser } from "@/lib/chat";
import { ProfileAvatar } from "../ProfileAvatar";

/** Find people by username and start a 1:1 or group conversation. */
export function NewMessageSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, SearchUser>>(new Map());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      searchUsers(term).then((r) => {
        setResults(r);
        setSearching(false);
      });
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  const toggle = (u: SearchUser) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(u.id)) next.delete(u.id);
      else next.set(u.id, u);
      return next;
    });
  };

  const isGroup = selected.size > 1;
  const chosen = [...selected.values()];

  const start = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createConversation(
        chosen.map((u) => u.id),
        isGroup,
        isGroup ? title.trim() || undefined : undefined,
      );
      if (id) onCreated(id);
      else setError("Couldn't start that chat.");
    } catch (e) {
      setError(e instanceof Error && e.message === "blocked" ? "You can't message this person." : "Couldn't start that chat.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="native-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="native-sheet flex max-h-[85vh] flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="New message"
      >
        <div className="native-sheet-handle" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading text-lg">New message</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
          <Search size={16} className="text-muted" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder="Search by username or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {chosen.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {chosen.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u)}
                className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs text-accent"
              >
                {u.displayName || `@${u.username}`}
                <X size={12} />
              </button>
            ))}
          </div>
        )}

        {isGroup && (
          <input
            className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
            placeholder="Group name (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}

        <div className="mt-3 min-h-24 flex-1 space-y-1 overflow-y-auto">
          {searching ? (
            <p className="py-6 text-center text-sm text-muted">Searching…</p>
          ) : q.trim() && results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No one found for “{q.trim()}”.</p>
          ) : (
            results.map((u) => {
              const on = selected.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u)}
                  className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left hover:bg-surface-2"
                >
                  <ProfileAvatar
                    profile={{ avatarUrl: u.avatarUrl ?? undefined, displayName: u.displayName || u.username || "?" }}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.displayName || `@${u.username}`}</p>
                    {u.username && <p className="truncate text-xs text-muted">@{u.username}</p>}
                  </div>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      on ? "border-accent bg-accent text-accent-foreground" : "border-line text-transparent"
                    }`}
                  >
                    <Check size={14} />
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error && (
          <p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="button"
          onClick={start}
          disabled={!chosen.length || busy}
          className="mt-3 h-11 w-full rounded-xl bg-accent text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          {isGroup ? `Start group (${chosen.length})` : "Start chat"}
        </button>
      </div>
    </div>
  );
}
