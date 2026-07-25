"use client";

import { create } from "zustand";

/**
 * Surface layout state (M4): panel order and size are data, not JSX, so the
 * arrangement can be dragged/resized in the running app, autosaved, exported
 * as JSON, and — once agreed — baked into DEFAULT_LAYOUT below.
 *
 * Sizing is a block grid: one block is ~the Ladder Filter panel's width
 * (--block-w) by half the Oscillators panel's height (--block-h). Every panel
 * spans a whole number of blocks in each axis; Arrange mode steps them.
 *
 * Same hydration rule as the patch store: first render uses the defaults, the
 * saved arrangement applies after mount.
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

export interface PanelSize {
  w: number; // width in blocks (≥1)
  h: number; // height in blocks (≥1)
}

export const MIN_W = 1;
export const MAX_W = 8;
export const MIN_H = 1;
export const MAX_H = 6;

export interface LayoutState {
  order: PanelId[];
  /** Per-panel block span. */
  size: Record<PanelId, PanelSize>;
  /**
   * Control orders inside panels, keyed by scope (e.g. "filter.sliders").
   * Absent scope = the panel's natural order. Ids unknown to a scope are
   * appended in natural order, so new controls survive old saves.
   */
  ctlOrders: Record<string, string[]>;
}

/** Block spans chosen so content fits without clipping at the default layout. */
const DEFAULT_SIZE: Record<PanelId, PanelSize> = {
  keyAssign: { w: 1, h: 2 },
  vco: { w: 6, h: 2 },
  mixer: { w: 1, h: 2 },
  filter: { w: 1, h: 2 },
  envelopes: { w: 3, h: 2 },
  effects: { w: 1, h: 2 },
  mg1: { w: 1, h: 2 },
  arp: { w: 1, h: 2 },
  master: { w: 1, h: 2 },
  meters: { w: 2, h: 2 },
  virtualPatch: { w: 6, h: 3 },
};

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
  size: DEFAULT_SIZE,
  ctlOrders: {},
};

const STORAGE_KEY = "web-synth.layout.v1";

interface LayoutStore extends LayoutState {
  /** Arrange mode: drag handles + move/resize controls visible. */
  arrange: boolean;

  setArrange: (on: boolean) => void;
  /** Move `id` to sit before (or after, when `before` is false) `target`. */
  reorder: (id: PanelId, target: PanelId, before: boolean) => void;
  /** Keyboard fallback: nudge a panel one position. */
  move: (id: PanelId, dir: -1 | 1) => void;
  /** Grow/shrink a panel by one block on one axis. */
  resize: (id: PanelId, axis: "w" | "h", delta: 1 | -1) => void;
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

function persist(state: LayoutState): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: state.order, size: state.size, ctlOrders: state.ctlOrders }),
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
      const next = { order, size: s.size, ctlOrders: s.ctlOrders };
      persist(next);
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
      const next = { order, size: s.size, ctlOrders: s.ctlOrders };
      persist(next);
      return next;
    });
  },

  resize: (id, axis, delta) => {
    set((s) => {
      const cur = s.size[id] ?? { w: 1, h: 1 };
      const next = { ...cur };
      if (axis === "w") next.w = Math.min(MAX_W, Math.max(MIN_W, cur.w + delta));
      else next.h = Math.min(MAX_H, Math.max(MIN_H, cur.h + delta));
      if (next.w === cur.w && next.h === cur.h) return s;
      const size = { ...s.size, [id]: next };
      const nextState = { order: s.order, size, ctlOrders: s.ctlOrders };
      persist(nextState);
      return nextState;
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
      const next = { order: s.order, size: s.size, ctlOrders };
      persist(next);
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
      const next = { order: s.order, size: s.size, ctlOrders };
      persist(next);
      return next;
    });
  },

  reset: () => {
    persist(DEFAULT_LAYOUT);
    set({ ...DEFAULT_LAYOUT, size: { ...DEFAULT_SIZE } });
  },

  toJson: () =>
    JSON.stringify(
      { order: get().order, size: get().size, ctlOrders: get().ctlOrders },
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
      // Start from defaults, overlay any saved sizes (ignores retired `wide`).
      const size = { ...DEFAULT_SIZE };
      for (const p of DEFAULT_LAYOUT.order) {
        const sv = saved.size?.[p];
        if (sv && typeof sv.w === "number" && typeof sv.h === "number") {
          size[p] = {
            w: Math.min(MAX_W, Math.max(MIN_W, sv.w)),
            h: Math.min(MAX_H, Math.max(MIN_H, sv.h)),
          };
        }
      }
      set({ order, size, ctlOrders: saved.ctlOrders ?? {} });
    } catch {
      // corrupted save — defaults stand
    }
  },
}));
