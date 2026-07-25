"use client";

import { useRef, useState } from "react";
import { useSynthStore } from "../state/store";
import { Toggle } from "./controls/Segmented";
import { Slider } from "./controls/Slider";
import { normToValue } from "./controls/sliderMath";

/** MIDI input picker + activity light (Chromium only; hidden elsewhere). */
export function MidiPicker() {
  const supported = useSynthStore((s) => s.midiSupported);
  const devices = useSynthStore((s) => s.midiDevices);
  const selected = useSynthStore((s) => s.midiSelected);
  const active = useSynthStore((s) => s.midiActive);
  const select = useSynthStore((s) => s.selectMidiDevice);
  const power = useSynthStore((s) => s.power);

  if (power !== "on") return null;
  if (!supported) {
    return <span className="u-muted midi__na">MIDI n/a in this browser</span>;
  }
  return (
    <label className="midi" aria-label="MIDI input device">
      <span className={`midi__led${active ? " is-active" : ""}`} aria-hidden />
      <span className="sl__label">MIDI</span>
      <select className="vp__select" value={selected} onChange={(e) => select(e.target.value)}>
        <option value="all">All inputs</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Performance wheels. Pitch springs back to center on release (hardware
 * behavior); Mod latches. MIDI CC1/bend drive the same paths.
 */
export function Wheels() {
  const wheelMod = useSynthStore((s) => s.wheelMod);
  const setModWheel = useSynthStore((s) => s.setModWheel);
  const setPitchBend = useSynthStore((s) => s.setPitchBend);
  const modMix = useSynthStore((s) => s.patch.modMix);
  const update = useSynthStore((s) => s.update);
  const [bendUi, setBendUi] = useState(0);
  const bendTrack = useRef<HTMLDivElement>(null);

  const setBendFromPointer = (clientY: number) => {
    const el = bendTrack.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = normToValue(1 - (clientY - r.top) / r.height, { min: -1, max: 1 });
    setBendUi(v);
    setPitchBend(v);
  };

  const releaseBend = () => {
    setBendUi(0);
    setPitchBend(0);
  };

  return (
    <div className="wheels" aria-label="Performance wheels">
      <div className="wheels__wheel">
        <div
          ref={bendTrack}
          className="sl__track wheels__bend"
          role="slider"
          tabIndex={0}
          aria-label="Pitch bend"
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={bendUi}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setBendFromPointer(e.clientY);
          }}
          onPointerMove={(e) => e.buttons === 1 && setBendFromPointer(e.clientY)}
          onPointerUp={releaseBend}
          onPointerCancel={releaseBend}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") { setBendUi(1); setPitchBend(1); e.preventDefault(); }
            else if (e.key === "ArrowDown") { setBendUi(-1); setPitchBend(-1); e.preventDefault(); }
          }}
          onKeyUp={releaseBend}
        >
          <div className="sl__thumb" style={{ bottom: `calc(${Math.round((bendUi + 1) * 50000) / 1000}% - 5px)` }} />
        </div>
        <span className="sl__label">Pitch</span>
      </div>
      <Slider label="Mod" min={0} max={1} value={wheelMod} format={(v) => `${Math.round(v * 100)}`} onChange={setModWheel} />
      <div className="wheels__mix">
        <Slider label="Mod mix" min={0} max={1} value={modMix.mix} format={(v) => (v < 0.5 ? "VCO4" : "Noise")} onChange={(mix) => update("modMix", { mix })} />
        <div className="wheels__dest">
          <Toggle label="Pitch" value={modMix.toPitch} onChange={(toPitch) => update("modMix", { toPitch })} />
          <Toggle label="Filter" value={modMix.toFilter} onChange={(toFilter) => update("modMix", { toFilter })} />
        </div>
      </div>
    </div>
  );
}
