"use client";

import { create } from "zustand";

/**
 * Surface layout state (M4): panel order and width are data, not JSX order,
 * so arrangements can be dragged in the running app, autosaved, exported as
 * JSON, and — once agreed — baked into DEFAULT_LAYOUT below.
 *
 * Same hydration rule as the patch store: first render uses the defaults,
 * the saved arrangement applies after mount.
 */

export type PanelId =
  | "keyAssign"
  | "vco"
  | "mixer"
  | "filter"
  | "envelopes"
  | "effects"
  | "mg1"
  | "arp"
  | "master"
  | "meters"
  | "virtualPatch";

export interface LayoutState {
  order: PanelId[];
  /** Panels rendered full-width. */
  wide: Partial<Record<PanelId, boolean>>;
}

export const DEFAULT_LAYOUT: LayoutState = {
  order: [
    "keyAssign",
    "vco",
    "mixer",
    "filter",
    "envelopes",
    "effects",
    "mg1",
    "arp",
    "master",
    "meters",
    "virtualPatch",
  ],
  wide: { vco: true, virtualPatch: true },
};

const STORAGE_KEY = "web-synth.layout.v1";

interface LayoutStore extends LayoutState {
  /** Arrange mode: drag handles + move/width controls visible. */
  arrange: boolean;

  setArrange: (on: boolean) => void;
  /** Move `id` to sit before (or after, when `before` is false) `target`. */
  reorder: (id: PanelId, target: PanelId, before: boolean) => void;
  /** Keyboard fallback: nudge a panel one position. */
  move: (id: PanelId, dir: -1 | 1) => void;
  toggleWide: (id: PanelId) => void;
  reset: () => void;
  toJson: () => string;
  hydrate: () => void;
}

function save(state: LayoutState): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: state.order, wide: state.wide }),
    );
  } catch {
    // storage unavailable — layout just won't persist
  }
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  ...DEFAULT_LAYOUT,
  arrange: false,

  setArrange: (on) => set({ arrange: on }),

  reorder: (id, target, before) => {
    if (id === target) return;
    set((s) => {
      const order = s.order.filter((p) => p !== id);
      const at = order.indexOf(target) + (before ? 0 : 1);
      order.splice(at, 0, id);
      const next = { order, wide: s.wide };
      save(next);
      return next;
    });
  },

  move: (id, dir) => {
    set((s) => {
      const i = s.order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.order.length) return s;
      const order = [...s.order];
      [order[i], order[j]] = [order[j], order[i]];
      const next = { order, wide: s.wide };
      save(next);
      return next;
    });
  },

  toggleWide: (id) => {
    set((s) => {
      const wide = { ...s.wide, [id]: !s.wide[id] };
      const next = { order: s.order, wide };
      save(next);
      return next;
    });
  },

  reset: () => {
    save(DEFAULT_LAYOUT);
    set({ ...DEFAULT_LAYOUT });
  },

  toJson: () =>
    JSON.stringify({ order: get().order, wide: get().wide }, null, 2),

  hydrate: () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<LayoutState>;
      // Tolerate schema drift: keep only known ids, append any new panels.
      const known = new Set<PanelId>(DEFAULT_LAYOUT.order);
      const order = (saved.order ?? []).filter((p): p is PanelId => known.has(p));
      for (const p of DEFAULT_LAYOUT.order) if (!order.includes(p)) order.push(p);
      set({ order, wide: { ...DEFAULT_LAYOUT.wide, ...saved.wide } });
    } catch {
      // corrupted save — defaults stand
    }
  },
}));
