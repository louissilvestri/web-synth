"use client";

import { useCallback, useRef } from "react";
import type { SliderScale } from "./sliderMath";
import { normToValue, nudge, valueToNorm } from "./sliderMath";

interface SliderProps extends SliderScale {
  label: string;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}

/**
 * Vertical slider — the house continuous control (user decision: sliders over
 * knobs; linear drag, big hit area, value always readable).
 * Accessibility: role=slider, arrow keys = fine step, Shift+arrows = coarse,
 * Home/End = extremes; 44px-wide hit target.
 */
export function Slider({
  label,
  value,
  onChange,
  format,
  disabled,
  ...scale
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromPointer = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      onChange(normToValue(1 - (clientY - r.top) / r.height, scale));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, scale.min, scale.max, scale.log, scale.step],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromPointer(e.clientY);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let v: number | undefined;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") v = nudge(value, 1, e.shiftKey, scale);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") v = nudge(value, -1, e.shiftKey, scale);
    else if (e.key === "Home") v = scale.min;
    else if (e.key === "End") v = scale.max;
    if (v !== undefined) {
      e.preventDefault();
      onChange(v);
    }
  };

  const norm = valueToNorm(value, scale);
  const text = format ? format(value) : String(Math.round(value * 100) / 100);

  return (
    <div className={`sl${disabled ? " sl--disabled" : ""}`}>
      <div
        ref={trackRef}
        className="sl__track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={scale.min}
        aria-valuemax={scale.max}
        aria-valuenow={value}
        aria-valuetext={text}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => e.buttons === 1 && !disabled && setFromPointer(e.clientY)}
        onKeyDown={onKeyDown}
        onWheel={(e) => {
          if (disabled) return;
          onChange(nudge(value, e.deltaY < 0 ? 1 : -1, e.shiftKey, scale));
        }}
      >
        <div className="sl__fill" style={{ height: `${norm * 100}%` }} />
        <div className="sl__thumb" style={{ bottom: `calc(${norm * 100}% - 5px)` }} />
      </div>
      <span className="sl__value u-mono">{text}</span>
      <span className="sl__label">{label}</span>
    </div>
  );
}
