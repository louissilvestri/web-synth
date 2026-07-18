# Build Plan

Strictly the build: what gets built, in what order, and when a phase is done.
Reference material lives in its own documents:

| Document | Contents |
|---|---|
| [FEATURES.md](FEATURES.md) | The feature set — what the instrument does and which hardware behavior it models |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, engine design, signal flow, code layout |
| [DESIGN.md](DESIGN.md) | UI/UX rules — style system, layout, behavior policies, accessibility |
| [DECISIONS.md](DECISIONS.md) | Locked decisions and their rationale |
| [REPO.md](REPO.md) | GitHub setup, branch strategy, CI notes, tooling |

Progress is tracked on the [project board](https://github.com/users/louissilvestri/projects/1)
and [milestones](https://github.com/louissilvestri/web-synth/milestones); every step below maps
to an issue.

---

## M0 — Scaffold & repo reset ✅ (2026-07-17)

- [x] Tag v1 app (`v1.0`), create `v2` branch
- [x] Scaffold Next.js 16 + TypeScript, static export
- [x] Wire `signature-style.css` tokens + next/font (Varela Round / Comfortaa / Fira Code)
- [x] Vitest + first engine module (pitch math)
- [x] CI, Pages deploy, TODO-to-Issue, Dependabot workflows; issue templates
- [x] Repo settings: Discussions, Wiki, Pages, CodeQL; labels, milestones M0–M5
- [x] Projects v2 board created and populated (#3–#32)
- [x] README + CONTRIBUTING rewritten

**Exit criteria met:** CI green on the scaffold; board populated.

## M1 — Paraphonic engine ✅ (2026-07-17, PR #33)

- [x] Typed module-graph engine core, patch = per-module schema (#5)
- [x] AudioWorklet host + esbuild worklet bundling (#6)
- [x] PolyBLEP oscillators, 6 waveforms × 6 ranges, drift (#7)
- [x] Huovilainen-style ladder VCF, self-osc, ⅓/⅔ tracking (#8)
- [x] Exponential ADSRs — shared EG1, per-VCO EG2 clones, trigger modes (#9)
- [x] Key assign: Mono / Poly / Unison-Share / Chord Memory (#10)
- [x] Hard sync + X-Mod, single/double, EG/MG-swept amount (#11)
- [x] Mixer: white/pink noise, feedback/overload drive (#12)
- [x] Glide, master tune, A-440 (#13)
- [x] Safety limiter + DC blocking (#14)

**Exit criteria met:** 35 DSP/allocation tests green; user approved the sound.

## M2 — Control surface 🔄 (PR #34 — awaiting merge)

- [x] Slider/segmented/toggle component library, keyboard-accessible (#15)
- [x] Panels in signal-flow order + left-rail shell (#16)
- [x] On-screen keyboard + QWERTY input, octave shift (#17)
- [x] Zustand patch store → engine push + localStorage autosave (#18)
- [x] Oscilloscope + spectrum + VU meters (#19)
- [x] *(added in review)* Shared PW/PWM sliders in oscillator panel
- [x] *(added in review)* Moog-style sync Interval control
- [x] *(added in review)* Drag/DSP performance pass; hydration fix
- [ ] Merge PR #34, close #15–#19, milestone closed

**Exit criteria:** every engine parameter reachable from the UI; keyboard-only operation works.

## M3 — Performance layer

- [ ] Arpeggiator engine: up/down/up-down, latch, 1/2/full range, MG2 clock, BPM (#20)
- [ ] Arpeggiator panel UI + interaction with key-assign modes (#20)
- [ ] Chord memory capture workflow (hold + latch UI, stored in patch) (#21)
- [ ] Web MIDI input: notes, velocity, pitch bend, mod CC1, sustain CC64, device picker (#22)
- [ ] Pitch/mod wheel UI + Model D mod-mix (VCO4 ↔ noise) routing (#23)
- [ ] MG2 (arp clock / trigger LFO) engine + panel (#23)

**Exit criteria:** latched arp over MIDI with an X-Mod sweep — the Mono/Poly party trick.

## M4 — Presets, sound character & polish

- [ ] Preset system: save-as / load / delete with confirm, JSON import/export (#24)
- [ ] Factory bank: classic Model D + Mono/Poly recipes, A/B'd against reference recordings (#24)
- [ ] **Sound-character tuning pass** — filter calibration, envelope knees, drift depth,
      waveform character refinements found while making the factory patches (#24)
- [ ] Live signal-flow visualization from the engine's module graph (#25)
- [ ] Accessibility audit: keyboard-only pass, contrast, reduced-motion; usability-auditor run (#26)
- [ ] Performance/CPU budget pass on mid hardware (#27)

**Exit criteria:** Lighthouse a11y ≥ 95; factory patches sound credibly like the hardware.

## M5 — FX & release

- [ ] Delay (clamped feedback loop) (#28)
- [ ] Chorus (multi-voice, modulated delay lines) (#29)
- [ ] Phaser (allpass cascade) (#30)
- [ ] Rebrand: name, wordmark, About page, repo description (#31)
- [ ] Merge `v2` → `main`; Pages deploy live; wiki user manual; tag `v2.0.0` (#32)
- [ ] Retarget Dependabot to `main`

**Exit criteria:** tagged release; live URL in repo About.
