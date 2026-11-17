"use client";

import type { AdsrPatch, Patch } from "../../../engine/core/patch";
import { useSynthStore } from "../../state/store";
import { Slider } from "../controls/Slider";
import { fmtPercent, fmtSeconds } from "../controls/sliderMath";
import { Sortable } from "../controls/Sortable";

function AdsrControls({
  module,
  eg,
}: {
  module: "eg1" | "eg2";
  eg: AdsrPatch;
}) {
  const update = useSynthStore((s) => s.update);
  const set = (partial: Partial<Patch["eg1"]>) => update(module, partial);

  return (
    // One shared scope: reordering A/D/S/R in either contour reorders both —
    // the two envelopes should always read the same way.
    <Sortable
      scope="envelopes.adsr"
      className="panel__sliders"
      items={[
        { id: "attack", el: <Slider label="A" min={0.001} max={5} log value={eg.attackS} format={fmtSeconds} onChange={(attackS) => set({ attackS })} /> },
        { id: "decay", el: <Slider label="D" min={0.001} max={5} log value={eg.decayS} format={fmtSeconds} onChange={(decayS) => set({ decayS })} /> },
        { id: "sustain", el: <Slider label="S" min={0} max={1} value={eg.sustain} format={fmtPercent} onChange={(sustain) => set({ sustain })} /> },
        { id: "release", el: <Slider label="R" min={0.001} max={8} log value={eg.releaseS} format={fmtSeconds} onChange={(releaseS) => set({ releaseS })} /> },
      ]}
    />
  );
}

export function EnvelopesPanel() {
  const eg1 = useSynthStore((s) => s.patch.eg1);
  const eg2 = useSynthStore((s) => s.patch.eg2);

  return (
    <section className="card panel" aria-label="Envelopes">
      <h2 className="panel__title">Contours</h2>
      <Sortable
        scope="envelopes"
        className="panel__row panel__row--split"
        items={[
          {
            id: "eg1",
            el: (
              <div>
                <h3 className="panel__sub">Filter (EG1)</h3>
                <AdsrControls module="eg1" eg={eg1} />
              </div>
            ),
          },
          {
            id: "eg2",
            el: (
              <div>
                <h3 className="panel__sub">Loudness (EG2)</h3>
                <AdsrControls module="eg2" eg={eg2} />
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
