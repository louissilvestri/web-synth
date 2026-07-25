"use client";

import { useSynthStore } from "../../state/store";
import { Segmented } from "../controls/Segmented";
import { Slider } from "../controls/Slider";
import { fmtHz, fmtPercent } from "../controls/sliderMath";
import { Sortable } from "../controls/Sortable";

export function MixerPanel() {
  const mixer = useSynthStore((s) => s.patch.mixer);
  const update = useSynthStore((s) => s.update);

  return (
    <section className="card panel" aria-label="Mixer">
      <h2 className="panel__title">Mixer</h2>
      <Sortable
        scope="mixer"
        className="panel__blocks"
        items={[
          {
            id: "noise-type",
            el: (
              <Segmented
                label="Noise type"
                options={[
                  { value: "white", text: "White" },
                  { value: "pink", text: "Pink" },
                ]}
                value={mixer.noiseType}
                onChange={(noiseType) => update("mixer", { noiseType })}
              />
            ),
          },
          {
            id: "sliders",
            el: (
              <Sortable
                scope="mixer.sliders"
                className="panel__sliders"
                items={[
                  { id: "noise", el: <Slider label="Noise" min={0} max={1} value={mixer.noiseLevel} format={fmtPercent} onChange={(noiseLevel) => update("mixer", { noiseLevel })} /> },
                  { id: "feedback", el: <Slider label="Feedback" min={0} max={1} value={mixer.feedback} format={fmtPercent} onChange={(feedback) => update("mixer", { feedback })} /> },
                ]}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

export function FilterPanel() {
  const vcf = useSynthStore((s) => s.patch.vcf);
  const update = useSynthStore((s) => s.update);

  return (
    <section className="card panel" aria-label="Filter">
      <h2 className="panel__title">Ladder filter</h2>
      <Sortable
        scope="filter"
        className="panel__blocks"
        items={[
          {
            id: "kbd-track",
            el: (
              <Segmented
                label="Keyboard tracking"
                options={[
                  { value: 0, text: "Off" },
                  { value: 1 / 3, text: "⅓" },
                  { value: 2 / 3, text: "⅔" },
                  { value: 1, text: "Full" },
                ]}
                value={vcf.kbdTrack}
                onChange={(kbdTrack) => update("vcf", { kbdTrack })}
              />
            ),
          },
          {
            id: "sliders",
            el: (
              <Sortable
                scope="filter.sliders"
                className="panel__sliders"
                items={[
                  { id: "cutoff", el: <Slider label="Cutoff" min={20} max={16000} log value={vcf.cutoffHz} format={fmtHz} onChange={(cutoffHz) => update("vcf", { cutoffHz })} /> },
                  { id: "emphasis", el: <Slider label="Emphasis" min={0} max={1} value={vcf.resonance} format={fmtPercent} onChange={(resonance) => update("vcf", { resonance })} /> },
                  { id: "contour", el: <Slider label="Contour" min={-1} max={1} value={vcf.egAmount} format={fmtPercent} onChange={(egAmount) => update("vcf", { egAmount })} /> },
                ]}
              />
            ),
          },
        ]}
      />
    </section>
  );
}
