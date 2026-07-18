"use client";

/** Left rail per style guide §7 — Presets/Settings unlock in M4. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <nav className="rail" aria-label="Primary">
        <h1 className="rail__brand">Web Synth</h1>
        <button type="button" className="rail__item is-active">
          Play
        </button>
        <span className="rail__item" aria-disabled="true" title="Coming in M4">
          Presets
        </span>
        <span className="rail__item" aria-disabled="true" title="Coming in M4">
          Settings
        </span>
        <a
          className="rail__item"
          href="https://github.com/louissilvestri/web-synth"
          target="_blank"
          rel="noreferrer"
        >
          About ↗
        </a>
        <span className="rail__foot u-mono">M2 · control surface</span>
      </nav>
      <main>{children}</main>
    </div>
  );
}
