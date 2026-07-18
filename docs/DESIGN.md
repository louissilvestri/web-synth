# UI/UX Design

Source of truth for the visual system: the design vault's style guide v2 **"Soft
Minimalism"** — `styles/signature-style.css` is consumed verbatim from it.

## Aesthetic

- **Soft Minimalism, no skeuomorphism** (locked, Q3): the *layout* honors the hardware
  (grouped panel sections, signal-flow order) but the *rendering* is house style — rounded
  `--radius:13px` cards on dark `--surface`, hairline blue-tinted borders, one `--accent`
  blue, Varela Round section labels, **Fira Code for every parameter value**. No wood, no
  photoreal knobs, no glow.
- **Sliders, not knobs** (locked, Q3): vertical sliders are the primary continuous control —
  better click-drag ergonomics, bigger hit area, value reads at a glance, and they echo the
  Mono/Poly's slider-heavy panel. Segmented controls / rockers for discrete choices.
- Dark is primary; the light variant rides on `[data-mode="light"]` (not yet surfaced).

## Layout — workflow order

Panels run in signal order (layout order = workflow order): *Key assign → Oscillators →
Mixer → Filter → Contours → Effects/MG → Master → Output*, with the performance row
(keyboard, later wheels/arp) anchored at the bottom like the hardware. Left rail = primary
nav (Play · Presets · Settings · About); the instrument is one view.

## Behavior policies (style guide §9)

- Working patch **autosaves** (a live instrument must not demand Save per tweak)
- **Save-as-preset is explicit**; **confirm** before preset overwrite/delete
- On-commit toasts; blur validation on preset names; grouped menus

## Accessibility

- Every control keyboard-operable: sliders are `role="slider"` with arrows (fine),
  Shift+arrows (coarse), Home/End; segments are radiogroups; toggles use `aria-pressed`
- Text ≥ 4.5:1; state never color-alone (labels + position, not tint)
- Meters honor `prefers-reduced-motion` (static ~1 fps frames) and pause when hidden
- Hit targets ≥ 40 px; visible focus rings throughout
- M4 gate: Lighthouse a11y ≥ 95 + usability-auditor pass on preset/chord-memory flows
