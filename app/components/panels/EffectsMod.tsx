"use client";

import { useSynthStore } from "../../state/store";
import { Segmented, Toggle } from "../controls/Segmented";
import { Slider } from "../controls/Slider";
import { fmtHz, fmtPercent } from "../controls/sliderMath";

/** The Mono/Poly "Effects" section: sync + X-Mod, with EG/MG sweep. */
export function EffectsPanel() {
  const fx = useSynthStore((s) => s.patch.effects);
  const update = useSynthStore((s) => s.update);

  return (
    <section className="card panel" aria-label="Effects — sync and cross-modulation">
      <h2 className="panel__title">Effects · sync / X-Mod</h2>
      <div className="panel__row">
        <Toggle label="Sync" value={fx.sync} onChange={(sync) => update("effects", { sync })} />
        <Segmented
          label="Topology"
          options={[
            { value: "single", text: "Single" },
            { value: "double", text: "Double" },
          ]}
          value={fx.topology}
          onChange={(topology) => update("effects", { topology })}
        />
      </div>
      <Segmented
        label="Effect modulation source"
        options={[
          { value: "off", text: "Off" },
          { value: "eg1", text: "EG1" },
          { value: "mg1", text: "MG1" },
        ]}
        value={fx.modSource}
        onChange={(modSource) => update("effects", { modSource })}
      />
      <div className="panel__sliders">
        <Slider label="X-Mod" min={0} max={1} value={fx.xmod} format={fmtPercent} onChange={(xmod) => update("effects", { xmod })} />
        <Slider label="Mod amt" min={0} max={1} value={fx.modDepth} format={fmtPercent} onChange={(modDepth) => update("effects", { modDepth })} />
        <Slider label="Interval" min={0} max={24} step={1} value={fx.intervalSemitones} format={(v) => `+${Math.round(v)} st`} onChange={(intervalSemitones) => update("effects", { intervalSemitones })} />
      </div>
    </section>
  );
}

export function Mg1Panel() {
  const mg1 = useSynthStore((s) => s.patch.mg1);
  const update = useSynthStore((s) => s.update);

  return (
    <section className="card panel" aria-label="Modulation generator 1">
      <h2 className="panel__title">MG1</h2>
      <Segmented
        label="MG1 waveform"
        options={[
          { value: "triangle", text: "▵" },
          { value: "saw", text: "◺" },
          { value: "ramp", text: "◿" },
          { value: "square", text: "⊓" },
          { value: "sh", text: "S&H" },
        ]}
        value={mg1.wave}
        onChange={(wave) => update("mg1", { wave })}
      />
      <div className="panel__sliders">
        <Slider label="Rate" min={0.05} max={30} log value={mg1.rateHz} format={fmtHz} onChange={(rateHz) => update("mg1", { rateHz })} />
        <Slider label="Pitch" min={0} max={100} value={mg1.toPitchCents} format={(v) => `${Math.round(v)}¢`} onChange={(toPitchCents) => update("mg1", { toPitchCents })} />
        <Slider label="Filter" min={0} max={1} value={mg1.toCutoff} format={fmtPercent} onChange={(toCutoff) => update("mg1", { toCutoff })} />
      </div>
    </section>
  );
}
