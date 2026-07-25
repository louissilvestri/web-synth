"use client";

import { useEffect } from "react";
import type { PanelId } from "../state/surfaceLayout";
import { useLayoutStore } from "../state/surfaceLayout";
import { useSynthStore } from "../state/store";
import { Keyboard } from "./Keyboard";
import { Meters } from "./Meters";
import { PanelFrame } from "./PanelFrame";
import { ArpPanel, VirtualPatchPanel } from "./panels/ArpVp";
import { EffectsPanel, Mg1Panel } from "./panels/EffectsMod";
import { EnvelopesPanel } from "./panels/Envelopes";
import { FilterPanel, MixerPanel } from "./panels/MixerFilter";
import { KeyAssignPanel, MasterPanel } from "./panels/Performance";
import { VcoBank } from "./panels/VcoBank";
import { MidiPicker, Wheels } from "./Wheels";

/** Panel registry — order and width come from the layout store, not JSX. */
const PANELS: Record<PanelId, { label: string; el: React.ReactNode }> = {
  keyAssign: { label: "Key assign", el: <KeyAssignPanel /> },
  vco: { label: "Oscillators", el: <VcoBank /> },
  mixer: { label: "Mixer", el: <MixerPanel /> },
  filter: { label: "Ladder filter", el: <FilterPanel /> },
  envelopes: { label: "Contours", el: <EnvelopesPanel /> },
  effects: { label: "Effects", el: <EffectsPanel /> },
  mg1: { label: "MG1", el: <Mg1Panel /> },
  arp: { label: "Arpeggiator", el: <ArpPanel /> },
  master: { label: "Master", el: <MasterPanel /> },
  meters: { label: "Output", el: <Meters /> },
  virtualPatch: { label: "Virtual patch", el: <VirtualPatchPanel /> },
};

export function Synth() {
  const hydrate = useSynthStore((s) => s.hydrate);
  const hydrateLayout = useLayoutStore((s) => s.hydrate);
  const order = useLayoutStore((s) => s.order);

  // Load autosaves after hydration (see stores; server render uses defaults).
  useEffect(() => {
    hydrate();
    hydrateLayout();
  }, [hydrate, hydrateLayout]);

  return (
    <div className="synth">
      <div className="synth__panels">
        {order.map((id) => (
          <PanelFrame key={id} id={id} label={PANELS[id].label}>
            {PANELS[id].el}
          </PanelFrame>
        ))}
      </div>
      <div className="perf-row">
        <Wheels />
        <Keyboard />
        <MidiPicker />
      </div>
    </div>
  );
}
