"use client";

import { useSynthStore } from "../../state/store";
import { Segmented, Toggle } from "../controls/Segmented";
import { Slider } from "../controls/Slider";
import { fmtSeconds, fmtSigned } from "../controls/sliderMath";

/** Key assign + glide — the Mono/Poly performance brain (arp lands in M3). */
export function KeyAssignPanel() {
  const ka = useSynthStore((s) => s.patch.keyAssign);
  const glide = useSynthStore((s) => s.patch.glide);
  const update = useSynthStore((s) => s.update);
  const allNotesOff = useSynthStore((s) => s.allNotesOff);

  return (
    <section className="card panel" aria-label="Key assign">
      <h2 className="panel__title">Key assign</h2>
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
      <Segmented
        label="Trigger mode"
        options={[
          { value: "single", text: "Single" },
          { value: "multiple", text: "Multi" },
        ]}
        value={ka.trigger}
        onChange={(trigger) => update("keyAssign", { trigger })}
      />
      <div className="panel__row">
        <Toggle label="Glide" value={glide.on} onChange={(on) => update("glide", { on })} />
      </div>
      <div className="panel__sliders">
        <Slider label="Detune" min={0} max={30} value={ka.unisonDetuneCents} format={fmtSigned("¢")} onChange={(unisonDetuneCents) => update("keyAssign", { unisonDetuneCents })} />
        <Slider label="Glide" min={0.005} max={2} log value={glide.timeS} format={fmtSeconds} onChange={(timeS) => update("glide", { timeS })} />
      </div>
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
      {power === "error" && (
        <p className="u-mono panel__error">Audio failed: {powerError}</p>
      )}
      <div className="panel__sliders">
        <Slider label="Tune" min={-100} max={100} value={master.tuneCents} format={fmtSigned("¢")} onChange={(tuneCents) => update("master", { tuneCents })} />
        <Slider label="Volume" min={0} max={1} value={master.volume} format={(v) => `${Math.round(v * 100)}`} onChange={(volume) => update("master", { volume })} />
      </div>
    </section>
  );
}
