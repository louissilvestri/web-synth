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
  /**
   * Control orders inside panels, keyed by scope (e.g. "filter.sliders").
   * Absent scope = the panel's natural order. Ids unknown to a scope are
   * appended in natural order, so new controls survive old saves.
   */
  ctlOrders: Record<string, string[]>;
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
  ctlOrders: {},
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
  /** Reorder a control within its scope (same drop semantics as panels). */
  reorderCtl: (scope: string, ids: string[], id: string, target: string, before: boolean) => void;
  moveCtl: (scope: string, ids: string[], id: string, dir: -1 | 1) => void;
  reset: () => void;
  toJson: () => string;
  hydrate: () => void;
}

/** Sort `ids` by a saved order; unknown ids keep natural position at the end. */
export function applyOrder(ids: string[], saved: string[] | undefined): string[] {
  if (!saved) return ids;
  const known = saved.filter((s) => ids.includes(s));
  for (const id of ids) if (!known.includes(id)) known.push(id);
  return known;
}

function insert(list: string[], id: string, target: string, before: boolean): string[] {
  const out = list.filter((p) => p !== id);
  out.splice(out.indexOf(target) + (before ? 0 : 1), 0, id);
  return out;
}

/**
 * Insert with a no-op guard: if the requested drop lands the item where it
 * already is (the "near half" of an adjacent neighbor — the horizontal-drag
 * dead zone), flip to the other side so every drop visibly acts.
 */
function insertActive(list: string[], id: string, target: string, before: boolean): string[] {
  const attempt = insert(list, id, target, before);
  if (attempt.join() === list.join()) return insert(list, id, target, !before);
  return attempt;
}

function save(state: LayoutState): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: state.order, wide: state.wide, ctlOrders: state.ctlOrders }),
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
      const order = insertActive(s.order, id, target, before) as PanelId[];
      const next = { order, wide: s.wide, ctlOrders: s.ctlOrders };
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
      const next = { order, wide: s.wide, ctlOrders: s.ctlOrders };
      save(next);
      return next;
    });
  },

  toggleWide: (id) => {
    set((s) => {
      const wide = { ...s.wide, [id]: !s.wide[id] };
      const next = { order: s.order, wide, ctlOrders: s.ctlOrders };
      save(next);
      return next;
    });
  },

  reorderCtl: (scope, ids, id, target, before) => {
    if (id === target) return;
    set((s) => {
      const current = applyOrder(ids, s.ctlOrders[scope]);
      const ctlOrders = {
        ...s.ctlOrders,
        [scope]: insertActive(current, id, target, before),
      };
      const next = { order: s.order, wide: s.wide, ctlOrders };
      save(next);
      return next;
    });
  },

  moveCtl: (scope, ids, id, dir) => {
    set((s) => {
      const current = applyOrder(ids, s.ctlOrders[scope]);
      const i = current.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= current.length) return s;
      const order = [...current];
      [order[i], order[j]] = [order[j], order[i]];
      const ctlOrders = { ...s.ctlOrders, [scope]: order };
      const next = { order: s.order, wide: s.wide, ctlOrders };
      save(next);
      return next;
    });
  },

  reset: () => {
    save(DEFAULT_LAYOUT);
    set({ ...DEFAULT_LAYOUT });
  },

  toJson: () =>
    JSON.stringify(
      { order: get().order, wide: get().wide, ctlOrders: get().ctlOrders },
      null,
      2,
    ),

  hydrate: () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<LayoutState>;
      // Tolerate schema drift: keep only known ids, append any new panels.
      const known = new Set<PanelId>(DEFAULT_LAYOUT.order);
      const order = (saved.order ?? []).filter((p): p is PanelId => known.has(p));
      for (const p of DEFAULT_LAYOUT.order) if (!order.includes(p)) order.push(p);
      set({
        order,
        wide: { ...DEFAULT_LAYOUT.wide, ...saved.wide },
        ctlOrders: saved.ctlOrders ?? {},
      });
    } catch {
      // corrupted save — defaults stand
    }
  },
}));
