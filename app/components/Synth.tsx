"use client";

import { Keyboard } from "./Keyboard";
import { Meters } from "./Meters";
import { EffectsPanel, Mg1Panel } from "./panels/EffectsMod";
import { EnvelopesPanel } from "./panels/Envelopes";
import { FilterPanel, MixerPanel } from "./panels/MixerFilter";
import { KeyAssignPanel, MasterPanel } from "./panels/Performance";
import { VcoBank } from "./panels/VcoBank";

/**
 * The instrument, laid out in signal-flow order (layout order = workflow
 * order): controllers → oscillators → mixer → filter → envelopes → mod/fx →
 * output, with the performance row (keyboard) anchored at the bottom.
 */
export function Synth() {
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
        <MasterPanel />
        <Meters />
      </div>
      <Keyboard />
    </div>
  );
}
