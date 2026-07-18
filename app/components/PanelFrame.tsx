"use client";

import { useRef } from "react";
import type { PanelId } from "../state/surfaceLayout";
import { useLayoutStore } from "../state/surfaceLayout";

/**
 * Wraps a panel for Arrange mode (M4): a drag handle bar with keyboard
 * move buttons and a width toggle. Dragging uses HTML5 drag & drop —
 * dropping on the left half of a target inserts before it, right half after.
 */
export function PanelFrame({
  id,
  label,
  children,
}: {
  id: PanelId;
  label: string;
  children: React.ReactNode;
}) {
  const arrange = useLayoutStore((s) => s.arrange);
  const wide = useLayoutStore((s) => !!s.wide[id]);
  const move = useLayoutStore((s) => s.move);
  const reorder = useLayoutStore((s) => s.reorder);
  const toggleWide = useLayoutStore((s) => s.toggleWide);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={`pframe${wide ? " pframe--wide" : ""}${arrange ? " pframe--arrange" : ""}`}
      draggable={arrange}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/panel-id", id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!arrange) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        if (!arrange) return;
        e.preventDefault();
        const dragged = e.dataTransfer.getData("text/panel-id") as PanelId;
        if (!dragged || dragged === id) return;
        const r = ref.current?.getBoundingClientRect();
        const before = r ? e.clientX < r.left + r.width / 2 : true;
        reorder(dragged, id, before);
      }}
    >
      {arrange && (
        <div className="pframe__bar">
          <span className="pframe__grip" aria-hidden>
            ⠿
          </span>
          <span className="pframe__name">{label}</span>
          <span className="pframe__tools">
            <button type="button" className="pframe__btn" aria-label={`Move ${label} earlier`} onClick={() => move(id, -1)}>
              ◀
            </button>
            <button type="button" className="pframe__btn" aria-label={`Move ${label} later`} onClick={() => move(id, 1)}>
              ▶
            </button>
            <button
              type="button"
              className={`pframe__btn${wide ? " is-active" : ""}`}
              aria-pressed={wide}
              aria-label={`Toggle ${label} full width`}
              onClick={() => toggleWide(id)}
            >
              ⟷
            </button>
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
