"use client";

/**
 * Segmented control — the house discrete selector (waveforms, ranges, modes).
 * Rendered as a radiogroup; every option always visible (style guide: no
 * icon-only, state never color-alone — the active segment is filled + bold).
 */
interface SegmentedProps<T extends string | number> {
  label: string;
  options: readonly { value: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`seg__btn${o.value === value ? " is-active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** Two-state rocker (the Model D panel switches). */
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`tgl${value ? " is-on" : ""}`}
      aria-pressed={value}
      onClick={() => onChange(!value)}
    >
      <span className="tgl__dot" aria-hidden />
      {label}
    </button>
  );
}
