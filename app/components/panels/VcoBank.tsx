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
  { value: "pulse", text: "⊓" },
];

const RANGES: { value: OscRange; text: string }[] = [
  { value: "lo", text: "LO" },
  { value: "32", text: "32'" },
  { value: "16", text: "16'" },
  { value: "8", text: "8'" },
  { value: "4", text: "4'" },
  { value: "2", text: "2'" },
];

/** Pick another VCO to follow for a PW/PWM value ("—" = own value). */
function SyncSelect({
  self,
  value,
  onChange,
  label,
}: {
  self: number;
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  return (
    <div className="vco__sync">
      <div className="seg seg--mini" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          className={`seg__btn${value === null ? " is-active" : ""}`}
          onClick={() => onChange(null)}
          title="Use this oscillator's own value"
        >
          —
        </button>
        {[0, 1, 2, 3]
          .filter((i) => i !== self)
          .map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={value === i}
              className={`seg__btn${value === i ? " is-active" : ""}`}
              onClick={() => onChange(i)}
              title={`Follow VCO ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
      </div>
      <span className="sl__label">Sync</span>
    </div>
  );
}

export function VcoBank() {
  const vco = useSynthStore((s) => s.patch.vco);
  const updateVco = useSynthStore((s) => s.updateVco);

  return (
    <section className="card panel" aria-label="Oscillator bank">
      <h2 className="panel__title">Oscillators</h2>
      <div className="vco-bank">
        {vco.map((v, i) => {
          const pwSynced = v.pwSyncTo !== null;
          const pwShown = pwSynced ? (vco[v.pwSyncTo!]?.pw ?? v.pw) : v.pw;
          return (
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
                          {
                            id: "pw",
                            el: (
                              <div className="vco__pw">
                                <Slider
                                  label="PW"
                                  min={-0.4}
                                  max={0.4}
                                  value={pwShown}
                                  format={(x) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`}
                                  onChange={(pw) => updateVco(i, { pw })}
                                  disabled={pwSynced}
                                />
                                <SyncSelect self={i} value={v.pwSyncTo} label={`VCO ${i + 1} PW sync source`} onChange={(pwSyncTo) => updateVco(i, { pwSyncTo })} />
                              </div>
                            ),
                          },
                        ]}
                      />
                    ),
                  },
                ]}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
