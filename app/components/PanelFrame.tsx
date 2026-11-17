"use client";

import { useRef } from "react";
import type { PanelId } from "../state/surfaceLayout";
import { MAX_H, MAX_W, MIN_H, MIN_W, useLayoutStore } from "../state/surfaceLayout";

/**
 * Wraps a panel for Arrange mode (M4). Each panel spans a whole number of grid
 * blocks (w × h); the bar lets you drag to reorder, nudge position, and step
 * the block size on each axis. Drag reorder uses HTML5 drag & drop — dropping
 * on the near half of a target inserts before it, the far half after.
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
  const size = useLayoutStore((s) => s.size[id]) ?? { w: 1, h: 1 };
  const move = useLayoutStore((s) => s.move);
  const reorder = useLayoutStore((s) => s.reorder);
  const resize = useLayoutStore((s) => s.resize);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={`pframe${arrange ? " pframe--arrange" : ""}`}
      style={{ gridColumn: `span ${size.w}`, gridRow: `span ${size.h}` }}
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
            <span className="pframe__step" role="group" aria-label={`${label} width`}>
              <button type="button" className="pframe__btn" aria-label="Narrower" disabled={size.w <= MIN_W} onClick={() => resize(id, "w", -1)}>
                −
              </button>
              <span className="pframe__dim u-mono">{size.w}w</span>
              <button type="button" className="pframe__btn" aria-label="Wider" disabled={size.w >= MAX_W} onClick={() => resize(id, "w", 1)}>
                +
              </button>
            </span>
            <span className="pframe__step" role="group" aria-label={`${label} height`}>
              <button type="button" className="pframe__btn" aria-label="Shorter" disabled={size.h <= MIN_H} onClick={() => resize(id, "h", -1)}>
                −
              </button>
              <span className="pframe__dim u-mono">{size.h}h</span>
              <button type="button" className="pframe__btn" aria-label="Taller" disabled={size.h >= MAX_H} onClick={() => resize(id, "h", 1)}>
                +
              </button>
            </span>
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
