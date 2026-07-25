"use client";

import { useState } from "react";
import { useSynthStore } from "../../state/store";
import { Segmented, Toggle } from "../controls/Segmented";
import { Slider } from "../controls/Slider";
import { fmtSeconds, fmtSigned } from "../controls/sliderMath";
import { Sortable } from "../controls/Sortable";

/** Key assign + glide — the Mono/Poly performance brain. */
export function KeyAssignPanel() {
  const ka = useSynthStore((s) => s.patch.keyAssign);
  const glide = useSynthStore((s) => s.patch.glide);
  const update = useSynthStore((s) => s.update);
  const allNotesOff = useSynthStore((s) => s.allNotesOff);
  const captureChord = useSynthStore((s) => s.captureChord);
  const [captureMsg, setCaptureMsg] = useState<"ok" | "need" | null>(null);

  return (
    <section className="card panel" aria-label="Key assign">
      <h2 className="panel__title">Key assign</h2>
      <Sortable
        scope="keyAssign"
        className="panel__blocks"
        items={[
          {
            id: "mode",
            el: (
              <Segmented
                label="Key assign mode"
                options={[
                  { value: "mono", text: "Mono" },
                  { value: "poly", text: "Poly" },
                  { value: "share", text: "Share" },
                  { value: "chord", text: "Chord" },
                ]}
                value={ka.mode}
                onChange={(mode) => {
                  allNotesOff(); // switching allocation mid-hold would strand gates
                  update("keyAssign", { mode });
                }}
              />
            ),
          },
          {
            id: "trigger",
            el: (
              <Segmented
                label="Trigger mode"
                options={[
                  { value: "single", text: "Single" },
                  { value: "multiple", text: "Multi" },
                ]}
                value={ka.trigger}
                onChange={(trigger) => update("keyAssign", { trigger })}
              />
            ),
          },
          {
            id: "options",
            el: (
              <div className="panel__row">
                <Toggle label="Glide" value={glide.on} onChange={(on) => update("glide", { on })} />
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    const ok = captureChord();
                    setCaptureMsg(ok ? "ok" : "need");
                    setTimeout(() => setCaptureMsg(null), 2500);
                  }}
                  title="Hold a chord (keys or MIDI), then click to store it for Chord mode"
                >
                  Capture chord
                </button>
              </div>
            ),
          },
          {
            id: "sliders",
            el: (
              <Sortable
                scope="keyAssign.sliders"
                className="panel__sliders"
                items={[
                  { id: "detune", el: <Slider label="Detune" min={0} max={30} value={ka.unisonDetuneCents} format={fmtSigned("¢")} onChange={(unisonDetuneCents) => update("keyAssign", { unisonDetuneCents })} /> },
                  { id: "glide-time", el: <Slider label="Glide" min={0.005} max={2} log value={glide.timeS} format={fmtSeconds} onChange={(timeS) => update("glide", { timeS })} /> },
                ]}
              />
            ),
          },
        ]}
      />
      {captureMsg && (
        <p className="u-mono" style={{ margin: 0, fontSize: "var(--fs-xs)", color: captureMsg === "ok" ? "var(--ok)" : "var(--alert)" }}>
          {captureMsg === "ok"
            ? `✓ stored [${ka.chord.join(", ")}]`
            : "Hold at least 2 notes while clicking"}
        </p>
      )}
    </section>
  );
}

export function MasterPanel() {
  const master = useSynthStore((s) => s.patch.master);
  const power = useSynthStore((s) => s.power);
  const powerError = useSynthStore((s) => s.powerError);
  const powerOn = useSynthStore((s) => s.powerOn);
  const update = useSynthStore((s) => s.update);

  return (
    <section className="card panel" aria-label="Master">
      <h2 className="panel__title">Master</h2>
      <Sortable
        scope="master"
        className="panel__blocks"
        items={[
          {
            id: "power",
            el: (
              <div className="panel__row">
                <button
                  type="button"
                  className={`btn ${power === "on" ? "btn--ghost" : "btn--primary"}`}
                  onClick={() => void powerOn()}
                  disabled={power === "on" || power === "starting"}
                >
                  {power === "on" ? "● On" : power === "starting" ? "Starting…" : "Power on"}
                </button>
                <Toggle label="A-440" value={master.a440} onChange={(a440) => update("master", { a440 })} />
              </div>
            ),
          },
          {
            id: "sliders",
            el: (
              <Sortable
                scope="master.sliders"
                className="panel__sliders"
                items={[
                  { id: "tune", el: <Slider label="Tune" min={-100} max={100} value={master.tuneCents} format={fmtSigned("¢")} onChange={(tuneCents) => update("master", { tuneCents })} /> },
                  { id: "bend-range", el: <Slider label="Bend" min={1} max={12} step={1} value={master.bendRangeSemis} format={(v) => `±${Math.round(v)} st`} onChange={(bendRangeSemis) => update("master", { bendRangeSemis })} /> },
                  { id: "volume", el: <Slider label="Volume" min={0} max={1} value={master.volume} format={(v) => `${Math.round(v * 100)}`} onChange={(volume) => update("master", { volume })} /> },
                ]}
              />
            ),
          },
        ]}
      />
      {power === "error" && (
        <p className="u-mono panel__error">Audio failed: {powerError}</p>
      )}
    </section>
  );
}
