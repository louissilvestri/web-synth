"use client";

import type { VpDest, VpSource } from "../../../engine/core/patch";
import { useSynthStore } from "../../state/store";
import { Segmented, Toggle } from "../controls/Segmented";
import { Slider } from "../controls/Slider";
import { fmtHz, fmtPercent } from "../controls/sliderMath";

export function ArpPanel() {
  const arp = useSynthStore((s) => s.patch.arp);
  const mg2 = useSynthStore((s) => s.patch.mg2);
  const update = useSynthStore((s) => s.update);
  const allNotesOff = useSynthStore((s) => s.allNotesOff);

  return (
    <section className="card panel" aria-label="Arpeggiator">
      <h2 className="panel__title">Arpeggiator</h2>
      <div className="panel__row">
        <Toggle
          label="Arp"
          value={arp.on}
          onChange={(on) => {
            allNotesOff();
            update("arp", { on });
          }}
        />
        <Toggle label="Latch" value={arp.latch} onChange={(latch) => update("arp", { latch })} />
      </div>
      <Segmented
        label="Arp mode"
        options={[
          { value: "up", text: "Up" },
          { value: "down", text: "Down" },
          { value: "updown", text: "Up·Dn" },
        ]}
        value={arp.mode}
        onChange={(mode) => update("arp", { mode })}
      />
      <Segmented
        label="Arp range"
        options={[
          { value: 1, text: "1 oct" },
          { value: 2, text: "2 oct" },
          { value: 3, text: "3 oct" },
        ]}
        value={arp.rangeOct}
        onChange={(rangeOct) => update("arp", { rangeOct: rangeOct as 1 | 2 | 3 })}
      />
      <div className="panel__sliders">
        <Slider label="BPM" min={40} max={240} step={1} value={arp.bpm} format={(v) => `${Math.round(v)}`} onChange={(bpm) => update("arp", { bpm })} />
        <Slider label="Gate" min={0.1} max={0.95} value={arp.gate} format={fmtPercent} onChange={(gate) => update("arp", { gate })} />
        <Slider label="MG2" min={0.05} max={30} log value={mg2.rateHz} format={fmtHz} onChange={(rateHz) => update("mg2", { rateHz })} />
      </div>
    </section>
  );
}

const VP_SOURCES: { value: VpSource; text: string }[] = [
  { value: "off", text: "Off" },
  { value: "eg1", text: "EG1" },
  { value: "eg2", text: "EG2" },
  { value: "mg1", text: "MG1" },
  { value: "mg2", text: "MG2" },
  { value: "velocity", text: "Velocity" },
  { value: "kbdTrack", text: "Kbd track" },
  { value: "modWheel", text: "Mod wheel" },
  { value: "pitchBend", text: "Pitch bend" },
];

const VP_DESTS: { value: VpDest; text: string }[] = [
  { value: "pitch", text: "Pitch" },
  { value: "pw", text: "Pulse width" },
  { value: "cutoff", text: "Cutoff" },
  { value: "resonance", text: "Resonance" },
  { value: "amp", text: "Amp" },
  { value: "noise", text: "Noise" },
  { value: "fxAmount", text: "FX amount" },
  { value: "mg1Rate", text: "MG1 rate" },
];

/** MS2000-style Virtual Patch: 6 slots, source → destination, bipolar amount. */
export function VirtualPatchPanel() {
  const vp = useSynthStore((s) => s.patch.virtualPatch);
  const update = useSynthStore((s) => s.update);

  const setSlot = (i: number, partial: Partial<(typeof vp)[number]>) => {
    const next = vp.map((s, k) => (k === i ? { ...s, ...partial } : s)) as typeof vp;
    update("virtualPatch", next);
  };

  return (
    <section className="card panel panel--wide" aria-label="Virtual patch modulation matrix">
      <h2 className="panel__title">Virtual patch</h2>
      <div className="vp">
        {vp.map((slot, i) => (
          <div key={i} className={`vp__slot${slot.source === "off" ? " vp__slot--off" : ""}`}>
            <span className="vp__num u-mono">{i + 1}</span>
            <label className="vp__field">
              <span className="vp__label">Source</span>
              <select
                className="vp__select"
                value={slot.source}
                onChange={(e) => setSlot(i, { source: e.target.value as VpSource })}
              >
                {VP_SOURCES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.text}
                  </option>
                ))}
              </select>
            </label>
            <label className="vp__field">
              <span className="vp__label">Dest</span>
              <select
                className="vp__select"
                value={slot.dest}
                onChange={(e) => setSlot(i, { dest: e.target.value as VpDest })}
              >
                {VP_DESTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.text}
                  </option>
                ))}
              </select>
            </label>
            <Slider
              label="Amount"
              min={-1}
              max={1}
              value={slot.amount}
              format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`}
              onChange={(amount) => setSlot(i, { amount })}
              disabled={slot.source === "off"}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
