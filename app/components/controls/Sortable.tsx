"use client";

import { Fragment } from "react";
import { applyOrder, useLayoutStore } from "../../state/surfaceLayout";

/**
 * A list whose children become drag-reorderable in Arrange mode (M4).
 * `scope` names the order in the layout store (e.g. "filter.sliders");
 * drags only land within the same scope. Scopes rendered more than once
 * (the four VCO strips) share one order, so rearranging one strip
 * rearranges all — consistency for free.
 *
 * Keyboard: focus a grip, Arrow keys nudge the control along the list.
 */
export function Sortable({
  scope,
  className,
  items,
}: {
  scope: string;
  className?: string;
  items: { id: string; el: React.ReactNode }[];
}) {
  const arrange = useLayoutStore((s) => s.arrange);
  const savedOrder = useLayoutStore((s) => s.ctlOrders[scope]);
  const reorderCtl = useLayoutStore((s) => s.reorderCtl);
  const moveCtl = useLayoutStore((s) => s.moveCtl);

  const ids = items.map((i) => i.id);
  const order = applyOrder(ids, savedOrder);
  const sorted = order
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is (typeof items)[number] => !!i);

  if (!arrange) {
    return (
      <div className={className}>
        {sorted.map((i) => (
          <Fragment key={i.id}>{i.el}</Fragment>
        ))}
      </div>
    );
  }

  const mime = `text/ctl-${scope}`;
  return (
    <div className={className}>
      {sorted.map((i) => (
        <div
          key={i.id}
          className="ctl"
          draggable
          onDragStart={(e) => {
            e.stopPropagation(); // don't start a panel drag
            e.dataTransfer.setData(mime, i.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(mime)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            const dragged = e.dataTransfer.getData(mime);
            if (!dragged) return;
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            // Horizontal rows judge by X, vertical stacks by Y — use the
            // dominant axis of the pointer offset from center.
            const dx = e.clientX - (r.left + r.width / 2);
            const dy = e.clientY - (r.top + r.height / 2);
            const before = Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy < 0;
            reorderCtl(scope, ids, dragged, i.id, before);
          }}
        >
          <button
            type="button"
            className="ctl__grip"
            aria-label={`Move ${i.id}`}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                moveCtl(scope, ids, i.id, -1);
              } else if (["ArrowRight", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                moveCtl(scope, ids, i.id, 1);
              }
            }}
          >
            ⠿
          </button>
          {i.el}
        </div>
      ))}
    </div>
  );
}
