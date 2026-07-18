# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router, TypeScript), **static export** | No server logic; deploys to GitHub Pages (`GITHUB_PAGES=true` adds the basePath) |
| Audio engine | Framework-free TS core + **one AudioWorklet processor** | Hard sync, X-Mod, and the ladder model need sample-level DSP; native nodes and Tone.js cannot express them. One paraphonic path = one processor |
| DSP | PolyBLEP band-limited oscillators; Huovilainen-style ladder (2× oversampled, fast-tanh stages); exponential ADSR segments | Fixes v1's aliasing, wrong filter slope, and clicky envelopes |
| WASM/Faust | Not now — escape hatch if CPU-bound | A single paraphonic path in TS is comfortably cheap |
| UI state | Zustand; patch object is the single source of truth | Works outside React (MIDI, arp clock); no context-rerender hazards |
| Testing | Vitest on the framework-free core + pure UI logic | DSP and allocation testable without an AudioContext |

## The engine models the real signal flow

The engine is a **typed module graph mirroring the hardware block diagram** — every classic
subtractive block is a named module with explicit audio and modulation ports:

```
KBD/MIDI ─→ KeyAssign ─→ [VCO1 VCO2 VCO3 VCO4] ─→ VCA×4 ─→ MIXER (+NOISE +FEEDBACK) ─→ VCF ─→ FX ─→ LIMITER ─→ OUT
                              ↑ sync/x-mod from VCO1 (VCO3 in double mode)
Modulators: EG1 (filter ADSR, shared) → VCF · EG2 (amp ADSR, cloned per VCO) → VCA×4
            MG1 → pitch / PWM / VCF / fx-amount · MG2 → arp clock
            WHEELS → pitch / mod-mix (VCO4 ↔ noise) · ARP → KeyAssign
```

Consequences:

1. **The patch format is the block diagram** — serialized per module (`vco[0..3]`, `mixer`,
   `vcf`, `eg1`, …); a patch reads as a signal-flow description.
2. **Introspectable** — the M4 signal-flow view renders from the engine's own graph, not a
   hand-drawn duplicate.
3. **Reusable** — the module library is the foundation for future synth projects.

Per-VCO amp VCAs sit **before** the shared filter — that is how the real MP-4 gates
individual notes through one VCF while releases overlap.

## Code layout

```
engine/
  core/        pitch math, patch schema, message protocol   (pure, tested)
  dsp/         oscillator, ladder, adsr, lfo, noise/util    (pure, tested)
  paraphonic/  keyAssign allocator, engineCore              (pure, tested)
  worklet/     AudioWorkletProcessor wrapper (thin)
  host/        main-thread AudioContext host + analyser tap
app/
  state/       Zustand patch store, autosave, migration
  components/  controls (Slider/Segmented/Toggle), panels, keyboard, meters
styles/        signature-style.css (consumed verbatim from the design system)
scripts/       build-worklet.mjs (esbuild bundle → public/worklet/processor.js)
```

- The worklet bundle is generated on `predev`/`prebuild`; **worklet changes need a dev-server
  restart** (UI changes hot-reload).
- `AudioContext` is created on the first user gesture, held in the host singleton — never in
  React state. React components only read/write the patch store.
- The saved working patch is applied **after mount** (`store.hydrate()`), never at module
  init — the server prerender and first client render must match (hydration).

## References

- [Web audio 2026 survey (youngju.dev)](https://www.youngju.dev/blog/culture/2026-05-16-web-audio-api-browser-audio-2026-audioworklet-tone-js-howler-wavesurfer-peaks-meyda-faust-csound-web-speech-deep-dive.en) · [kuon-rnd.com survey](https://kuon-rnd.com/guide/en/browser-audio-technology)
- Zavalishin, *The Art of VA Filter Design*; Huovilainen (DAFx-04); Välimäki & Huovilainen (polyBLEP)
- [Tone.js](https://github.com/Tonejs/Tone.js/) (evaluated and rejected for this engine — cannot express sync/X-Mod/ladder)
