"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

// Keeps an unsaved form on this device so a half-filled bill survives the
// phone browser dropping the tab in the background, a reload, or being sent
// to the sign-in page. The draft is written as the user types (and again the
// moment the page is hidden), restored when the form opens, and cleared once
// the bill is saved. Drafts live only in this browser — never on the server.

const PREFIX = "draft:";

type Stored<T> = { savedAt: number; value: T };

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored<T>;
    // Only today's drafts come back: a bill left half-done yesterday would
    // otherwise reopen with yesterday's date and be saved on the wrong day.
    if (!stored || new Date(stored.savedAt).toDateString() !== new Date().toDateString()) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return stored.value;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T) {
  try {
    const stored: Stored<T> = { savedAt: Date.now(), value };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(stored));
  } catch {
    // Storage full or blocked (private mode) — the form still works, just unsaved.
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/**
 * @param key      unique per form and store, e.g. `bill-new:MS`
 * @param value    everything the user has typed, as plain JSON
 * @param isEmpty  true when there is nothing worth keeping
 * @param restore  puts a saved draft back into the form
 * @param discard  clears the form (used by the toast's Discard button)
 * @returns `clear` — call after a successful save.
 */
export function useFormDraft<T>({
  key,
  value,
  isEmpty,
  restore,
  discard,
}: {
  key: string;
  value: T;
  isEmpty: (v: T) => boolean;
  restore: (v: T) => void;
  discard: () => void;
}): { clear: () => void } {
  const ready = useRef(false);
  // Set by clear() after a save, so closing the form doesn't write the saved
  // entry back as a draft; reset as soon as the user types again.
  const cleared = useRef(false);
  const latest = useRef(value);
  const fns = useRef({ isEmpty, restore, discard });

  // Keep the latest form value and callbacks for the effects below (declared
  // first, so it runs before them after every render).
  useEffect(() => {
    latest.current = value;
    fns.current = { isEmpty, restore, discard };
  });

  // Restore once, when the form opens.
  useEffect(() => {
    const draft = read<T>(key);
    if (draft !== null && !fns.current.isEmpty(draft)) {
      fns.current.restore(draft);
      toast("Unsaved entry restored — carry on where you left off.", {
        // A fixed id, so a second run of this effect (React runs it twice in
        // development) updates the same toast instead of showing another.
        id: `${PREFIX}${key}`,
        duration: 8000,
        action: {
          label: "Discard",
          onClick: () => {
            remove(key);
            fns.current.discard();
          },
        },
      });
    }
    ready.current = true;
  }, [key]);

  // Save as the user types (debounced) …
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!ready.current) return;
    const t = window.setTimeout(() => {
      cleared.current = false;
      if (fns.current.isEmpty(latest.current)) remove(key);
      else write(key, latest.current);
    }, 400);
    return () => window.clearTimeout(t);
  }, [key, serialized]);

  // … immediately when the page is hidden (phone call, app switch, lock), and
  // when the form closes (store switch, going to another page).
  useEffect(() => {
    function flush() {
      if (!ready.current || cleared.current) return;
      if (fns.current.isEmpty(latest.current)) remove(key);
      else write(key, latest.current);
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [key]);

  const clear = useCallback(() => {
    cleared.current = true;
    remove(key);
  }, [key]);
  return { clear };
}
