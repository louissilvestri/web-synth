"use client";

import type { OscRange } from "../../../engine/core/pitch";
import type { Waveform } from "../../../engine/core/patch";
import { useSynthStore } from "../../state/store";
import { Segmented, Toggle } from "../controls/Segmented";
import { Slider } from "../controls/Slider";
import { fmtSigned } from "../controls/sliderMath";
import { Sortable } from "../controls/Sortable";

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
  const pwm = useSynthStore((s) => s.patch.pwm);
  const updateVco = useSynthStore((s) => s.updateVco);
  const update = useSynthStore((s) => s.update);

  return (
    <section className="card panel" aria-label="Oscillator bank">
      <div className="panel__row" style={{ justifyContent: "space-between" }}>
        <h2 className="panel__title">Oscillators</h2>
        {/* Shared PW/PWM (Mono/Poly-style): applies to pulse waveforms; MG1 is the mod source */}
        <Sortable
          scope="vco.pwm"
          className="panel__sliders"
          items={[
            { id: "pw", el: <Slider label="PW" min={-0.35} max={0.35} value={pwm.widthOffset} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`} onChange={(widthOffset) => update("pwm", { widthOffset })} /> },
            { id: "pwm", el: <Slider label="PWM" min={0} max={1} value={pwm.depth} format={(v) => `${Math.round(v * 100)}%`} onChange={(depth) => update("pwm", { depth })} /> },
          ]}
        />
      </div>
      <div className="vco-bank">
        {vco.map((v, i) => (
          <div key={i} className={`vco${v.enabled ? "" : " vco--off"}`}>
            <div className="vco__head">
              <Toggle label={`VCO ${i + 1}`} value={v.enabled} onChange={(on) => updateVco(i, { enabled: on })} />
              {i === 3 && (
                <Toggle label="KBD" value={v.keyboardTrack} onChange={(on) => updateVco(i, { keyboardTrack: on })} />
              )}
            </div>
            {/* One shared scope for all four strips: rearranging one strip
                rearranges them all — the bank always reads uniformly. */}
            <Sortable
              scope="vco.strip"
              className="panel__blocks"
              items={[
                { id: "wave", el: <Segmented label={`VCO ${i + 1} waveform`} options={WAVES} value={v.wave} onChange={(wave) => updateVco(i, { wave })} /> },
                { id: "range", el: <Segmented label={`VCO ${i + 1} range`} options={RANGES} value={v.range} onChange={(range) => updateVco(i, { range })} /> },
                {
                  id: "sliders",
                  el: (
                    <Sortable
                      scope="vco.strip.sliders"
                      className="panel__sliders"
                      items={[
                        ...(i > 0
                          ? [{ id: "tune", el: <Slider label="Tune" min={-7} max={7} step={1} value={v.semitones} format={fmtSigned(" st")} onChange={(semitones: number) => updateVco(i, { semitones })} /> }]
                          : []),
                        { id: "fine", el: <Slider label="Fine" min={-50} max={50} value={v.fineCents} format={fmtSigned("¢")} onChange={(fineCents) => updateVco(i, { fineCents })} /> },
                        { id: "level", el: <Slider label="Level" min={0} max={1} value={v.level} format={(x) => `${Math.round(x * 100)}`} onChange={(level) => updateVco(i, { level })} /> },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
