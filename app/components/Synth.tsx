"use client";

import { useEffect } from "react";
import { useSynthStore } from "../state/store";
import { Keyboard } from "./Keyboard";
import { Meters } from "./Meters";
import { ArpPanel, VirtualPatchPanel } from "./panels/ArpVp";
import { EffectsPanel, Mg1Panel } from "./panels/EffectsMod";
import { EnvelopesPanel } from "./panels/Envelopes";
import { FilterPanel, MixerPanel } from "./panels/MixerFilter";
import { KeyAssignPanel, MasterPanel } from "./panels/Performance";
import { VcoBank } from "./panels/VcoBank";
import { MidiPicker, Wheels } from "./Wheels";

/**
 * The instrument, laid out in signal-flow order (layout order = workflow
 * order): controllers → oscillators → mixer → filter → envelopes → mod/fx →
 * output, with the performance row (keyboard) anchored at the bottom.
 */
export function Synth() {
  const hydrate = useSynthStore((s) => s.hydrate);
  // Load the autosaved working patch after hydration (see store.hydrate).
  useEffect(() => hydrate(), [hydrate]);

  return (
    <div className="synth">
      <div className="synth__panels">
        <KeyAssignPanel />
        <VcoBank />
        <MixerPanel />
        <FilterPanel />
        <EnvelopesPanel />
        <EffectsPanel />
        <Mg1Panel />
        <ArpPanel />
        <MasterPanel />
        <Meters />
        <VirtualPatchPanel />
      </div>
      <div className="perf-row">
        <Wheels />
        <Keyboard />
        <MidiPicker />
      </div>
    </div>
  );
}
