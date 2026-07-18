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

  it("toggleWide() flips one panel's width only", () => {
    const { toggleWide } = useLayoutStore.getState();
    toggleWide("filter");
    const s = useLayoutStore.getState();
    expect(s.wide.filter).toBe(true);
    expect(!!s.wide.vco).toBe(true); // default untouched
    toggleWide("filter");
    expect(useLayoutStore.getState().wide.filter).toBe(false);
  });

  it("reset() restores the shipped default", () => {
    const { reorder, toggleWide, reset } = useLayoutStore.getState();
    reorder("master", "keyAssign", true);
    toggleWide("mixer");
    reset();
    const s = useLayoutStore.getState();
    expect(s.order).toEqual(DEFAULT_LAYOUT.order);
    expect(s.wide).toEqual(DEFAULT_LAYOUT.wide);
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

  it("toJson() round-trips the arrangement", () => {
    const { reorder, toJson } = useLayoutStore.getState();
    reorder("arp", "keyAssign", true);
    const parsed = JSON.parse(toJson());
    expect(parsed.order[0]).toBe("arp");
    expect(parsed.order).toHaveLength(DEFAULT_LAYOUT.order.length);
  });
});
