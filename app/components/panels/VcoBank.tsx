"use client";

import type { OscRange } from "../../../engine/core/pitch";
import type { Waveform } from "../../../engine/core/patch";
import { useSynthStore } from "../../state/store";
import { Segmented, Toggle } from "../controls/Segmented";
import { Slider } from "../controls/Slider";
import { fmtSigned } from "../controls/sliderMath";

const WAVES: { value: Waveform; text: string }[] = [
  { value: "triangle", text: "▵" },
  { value: "shark", text: "◺" },
  { value: "saw", text: "◿" },
  { value: "square", text: "⊓" },
  { value: "pulseWide", text: "⨅" },
  { value: "pulseNarrow", text: "∏" },
];

const RANGES: { value: OscRange; text: string }[] = [
  { value: "lo", text: "LO" },
  { value: "32", text: "32'" },
  { value: "16", text: "16'" },
  { value: "8", text: "8'" },
  { value: "4", text: "4'" },
  { value: "2", text: "2'" },
];

export function VcoBank() {
  const vco = useSynthStore((s) => s.patch.vco);
  const updateVco = useSynthStore((s) => s.updateVco);

  return (
    <section className="card panel panel--wide" aria-label="Oscillator bank">
      <h2 className="panel__title">Oscillators</h2>
      <div className="vco-bank">
        {vco.map((v, i) => (
          <div key={i} className={`vco${v.enabled ? "" : " vco--off"}`}>
            <div className="vco__head">
              <Toggle label={`VCO ${i + 1}`} value={v.enabled} onChange={(on) => updateVco(i, { enabled: on })} />
              {i === 3 && (
                <Toggle label="KBD" value={v.keyboardTrack} onChange={(on) => updateVco(i, { keyboardTrack: on })} />
              )}
            </div>
            <Segmented label={`VCO ${i + 1} waveform`} options={WAVES} value={v.wave} onChange={(wave) => updateVco(i, { wave })} />
            <Segmented label={`VCO ${i + 1} range`} options={RANGES} value={v.range} onChange={(range) => updateVco(i, { range })} />
            <div className="panel__sliders">
              {i > 0 && (
                <Slider label="Tune" min={-7} max={7} step={1} value={v.semitones} format={fmtSigned(" st")} onChange={(semitones) => updateVco(i, { semitones })} />
              )}
              <Slider label="Fine" min={-50} max={50} value={v.fineCents} format={fmtSigned("¢")} onChange={(fineCents) => updateVco(i, { fineCents })} />
              <Slider label="Level" min={0} max={1} value={v.level} format={(x) => `${Math.round(x * 100)}`} onChange={(level) => updateVco(i, { level })} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
