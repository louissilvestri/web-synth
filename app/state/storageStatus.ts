"use client";

import { create } from "zustand";

/**
 * Whether persisting to localStorage is working.
 *
 * Both the patch store and the layout store write through here, so a failure
 * (quota exceeded, private-window restrictions, storage disabled) surfaces to
 * the user instead of being swallowed by a bare `catch {}`. Silently assuming
 * "saved" is the expensive failure: the user keeps working and loses it all
 * on reload.
 */
interface StorageStatus {
  failed: boolean;
  /** Human-readable reason, for the banner. */
  reason: string;
  reportFailure: (err: unknown) => void;
  reportSuccess: () => void;
}

export const useStorageStatus = create<StorageStatus>((set, get) => ({
  failed: false,
  reason: "",

  reportFailure: (err) => {
    if (get().failed) return; // already reported — don't thrash the banner
    const reason =
      err instanceof Error && /quota|exceeded/i.test(err.message)
        ? "Browser storage is full."
        : "Browser storage is unavailable (private window or blocked).";
    set({ failed: true, reason });
  },

  reportSuccess: () => {
    if (get().failed) set({ failed: false, reason: "" });
  },
}));

/** Write a JSON value to localStorage, reporting failure rather than hiding it. */
export function persistJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    useStorageStatus.getState().reportSuccess();
  } catch (err) {
    useStorageStatus.getState().reportFailure(err);
  }
}
