import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, useLayoutStore } from "./surfaceLayout";

beforeEach(() => {
  useLayoutStore.setState({ ...DEFAULT_LAYOUT, arrange: false });
});

describe("layout store", () => {
  it("move() swaps a panel with its neighbor and clamps at the ends", () => {
    const { move } = useLayoutStore.getState();
    const first = DEFAULT_LAYOUT.order[0];
    const second = DEFAULT_LAYOUT.order[1];
    move(second, -1);
    expect(useLayoutStore.getState().order.slice(0, 2)).toEqual([second, first]);
    move(second, -1); // already first — no change
    expect(useLayoutStore.getState().order[0]).toBe(second);
  });

  it("reorder() inserts before or after the target", () => {
    const { reorder } = useLayoutStore.getState();
    reorder("meters", "keyAssign", true);
    expect(useLayoutStore.getState().order[0]).toBe("meters");
    reorder("meters", "virtualPatch", false);
    const order = useLayoutStore.getState().order;
    expect(order[order.length - 1]).toBe("meters");
    expect(order).toHaveLength(DEFAULT_LAYOUT.order.length); // no dupes/losses
  });

  it("resize() steps one panel's block span on one axis only", () => {
    const { resize } = useLayoutStore.getState();
    const before = DEFAULT_LAYOUT.size.filter;
    resize("filter", "w", 1);
    const s = useLayoutStore.getState();
    expect(s.size.filter.w).toBe(before.w + 1);
    expect(s.size.filter.h).toBe(before.h); // other axis untouched
    expect(s.size.vco).toEqual(DEFAULT_LAYOUT.size.vco); // other panels untouched
  });

  it("resize() clamps at the block limits", async () => {
    const { MIN_W, MAX_H } = await import("./surfaceLayout");
    const { resize } = useLayoutStore.getState();
    for (let i = 0; i < 12; i++) resize("mixer", "w", -1);
    expect(useLayoutStore.getState().size.mixer.w).toBe(MIN_W);
    for (let i = 0; i < 12; i++) resize("mixer", "h", 1);
    expect(useLayoutStore.getState().size.mixer.h).toBe(MAX_H);
  });

  it("reset() restores the shipped default", () => {
    const { reorder, resize, reset } = useLayoutStore.getState();
    reorder("master", "keyAssign", true);
    resize("mixer", "w", 1);
    reset();
    const s = useLayoutStore.getState();
    expect(s.order).toEqual(DEFAULT_LAYOUT.order);
    expect(s.size).toEqual(DEFAULT_LAYOUT.size);
  });

  it("dropping on the near half of a neighbor still acts (no-op flip)", () => {
    const { reorder } = useLayoutStore.getState();
    const [a, b] = DEFAULT_LAYOUT.order;
    // a dropped on b's left half = "before b" = where a already is → flips to after
    reorder(a, b, true);
    expect(useLayoutStore.getState().order.slice(0, 2)).toEqual([b, a]);
  });

  it("control orders: reorderCtl/moveCtl persist per scope with no-op flip", () => {
    const ids = ["cutoff", "emphasis", "contour"];
    const { reorderCtl, moveCtl } = useLayoutStore.getState();
    // near-half drop on the immediate right neighbor flips to a real move
    reorderCtl("filter.sliders", ids, "cutoff", "emphasis", true);
    expect(useLayoutStore.getState().ctlOrders["filter.sliders"]).toEqual([
      "emphasis",
      "cutoff",
      "contour",
    ]);
    moveCtl("filter.sliders", ids, "contour", -1);
    expect(useLayoutStore.getState().ctlOrders["filter.sliders"]).toEqual([
      "emphasis",
      "contour",
      "cutoff",
    ]);
  });

  it("applyOrder appends ids unknown to a stale save", async () => {
    const { applyOrder } = await import("./surfaceLayout");
    expect(applyOrder(["a", "b", "new"], ["b", "a"])).toEqual(["b", "a", "new"]);
    expect(applyOrder(["a", "b"], undefined)).toEqual(["a", "b"]);
  });

  it("toJson() round-trips order and block sizes", () => {
    const { reorder, resize, toJson } = useLayoutStore.getState();
    reorder("arp", "keyAssign", true);
    resize("arp", "h", 1);
    const parsed = JSON.parse(toJson());
    expect(parsed.order[0]).toBe("arp");
    expect(parsed.order).toHaveLength(DEFAULT_LAYOUT.order.length);
    expect(parsed.size.arp.h).toBe(DEFAULT_LAYOUT.size.arp.h + 1);
  });
});
