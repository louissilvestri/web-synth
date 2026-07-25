"use client";

import { useState } from "react";
import { useStorageStatus } from "../state/storageStatus";
import { useLayoutStore } from "../state/surfaceLayout";

/** Left rail per style guide §7 — Presets/Settings unlock in M5. */
export function Shell({ children }: { children: React.ReactNode }) {
  const arrange = useLayoutStore((s) => s.arrange);
  const setArrange = useLayoutStore((s) => s.setArrange);
  const reset = useLayoutStore((s) => s.reset);
  const toJson = useLayoutStore((s) => s.toJson);
  const undoable = useLayoutStore((s) => s.undoable);
  const undoReset = useLayoutStore((s) => s.undoReset);
  const storageFailed = useStorageStatus((s) => s.failed);
  const storageReason = useStorageStatus((s) => s.reason);
  const [copied, setCopied] = useState(false);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Primary">
        <h1 className="rail__brand">Web Synth</h1>
        <button type="button" className="rail__item is-active">
          Play
        </button>
        <button
          type="button"
          className={`rail__item${arrange ? " is-active" : ""}`}
          aria-pressed={arrange}
          onClick={() => setArrange(!arrange)}
        >
          {arrange ? "Arrange ✓" : "Arrange"}
        </button>
        {arrange && (
          <div className="rail__sub">
            <button
              type="button"
              className="rail__item"
              onClick={() => {
                void navigator.clipboard.writeText(toJson()).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? "Copied ✓" : "Copy JSON"}
            </button>
            {undoable ? (
              <button
                type="button"
                className="rail__item rail__item--undo"
                onClick={undoReset}
              >
                ↶ Undo reset
              </button>
            ) : (
              <button type="button" className="rail__item" onClick={reset}>
                Reset layout
              </button>
            )}
          </div>
        )}
        <span className="rail__item" aria-disabled="true" title="Coming in M5">
          Presets
        </span>
        <span className="rail__item" aria-disabled="true" title="Coming in M5">
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
        <span className="rail__foot u-mono">M4 · surface layout</span>
      </nav>
      <main>
        {storageFailed && (
          <div className="storage-banner" role="alert">
            <strong>Changes aren&apos;t being saved.</strong> {storageReason} Your
            patch and layout will be lost when this page reloads.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
