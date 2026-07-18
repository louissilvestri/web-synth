"use client";

import { useCallback, useRef, useState } from "react";
import { audioEngine } from "../../engine/host/audioEngine";

/**
 * M1 verification harness: boots the AudioWorklet engine and plays a short
 * A-minor arpeggio through the full paraphonic path. Replaced by the real
 * control surface in M2.
 */
export function EngineSmokeTest() {
  const [state, setState] = useState<"idle" | "starting" | "playing" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const busy = useRef(false);

  const play = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState("starting");
    try {
      await audioEngine.init();
      setState("playing");
      const notes = [57, 60, 64, 69]; // A3 C4 E4 A4 — one note per VCO slot
      notes.forEach((n, i) => {
        setTimeout(() => audioEngine.noteOn(n, 1), i * 180);
        setTimeout(() => audioEngine.noteOff(n), 900 + i * 120);
      });
      setTimeout(() => {
        setState("idle");
        busy.current = false;
      }, 1900);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
      busy.current = false;
    }
  }, []);

  return (
    <div style={{ display: "grid", gap: "var(--gap)" }}>
      <button
        className="btn btn--primary"
        onClick={play}
        disabled={state === "starting" || state === "playing"}
      >
        {state === "playing" ? "Playing…" : "Play test arpeggio"}
      </button>
      {state === "error" && (
        <p className="u-mono" style={{ color: "var(--alert)", fontSize: "var(--fs-sm)" }}>
          Engine failed to start: {error}
        </p>
      )}
    </div>
  );
}
