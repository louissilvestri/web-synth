# Web Synth v2 — Overhaul Plan

> **Status: APPROVED — decisions locked 2026-07-17 (§8). Build not yet started.**
> This plan defines the feature set, architecture, UI/UX direction, and repo setup for the
> ground-up rewrite. The instrument will be **rebranded** — name TBD (placeholder: "the instrument").

---

## 1. Current state (audit of v1)

| Area | Finding |
|---|---|
| Stack | Vanilla JS + Express static server, no build system, no TypeScript |
| Structure | Monolithic 54 KB `synth.js` — audio engine, DOM manipulation, and UI wiring tangled in one class; `try/catch` swallowing errors throughout |
| DSP | Native `OscillatorNode` (aliasing on saw/square at high pitch), 12 dB/oct `BiquadFilter` (not a ladder), **linear** envelope ramps (audible clicks), voice cleanup via `setTimeout` |
| Effects | Phaser, delay, chorus all flagged broken in README ("Known issues") — artifacts, runaway feedback, CPU spikes |
| Tests | One trivial test on a utils file; a `sync-utils.js` script hand-copies code between CJS and ESM copies |
| MIDI | Basic Web MIDI note input exists — the one part worth keeping conceptually |

**Verdict: rewrite.** Salvage the *ideas* (LFO routing, scope/VU visuals, MIDI in, on-screen
keyboard) but no code.

---

## 2. Product concept — LOCKED

**One hybrid instrument with the authentic paraphonic architecture:**

> A **4-VCO bank** (Mono/Poly count, each VCO carrying the full **Model D waveform/range set**)
> → one mixer → **one shared 24 dB ladder filter** (Model D voice character) → per-VCO amp VCAs —
> exactly the MP-4's signal topology — driven by the **Mono/Poly performance brain**
> (key-assign modes, arpeggiator, chord memory, sync/X-Mod "Effects" section).

The paraphonic choice is a feature, not a compromise: it *is* how the Mono/Poly works, it gives
the characteristic "shared filter sweep across held notes" behavior, and it collapses the DSP to
a single signal path. In Mono mode the instrument is effectively a 4-oscillator Model D.

### 2.1 From the Moog Model D

Sources: Minimoog service manual & operation manual (archive.org), polynominal.com, workrobot.com/music/minimoog.html

| Feature | Detail |
|---|---|
| **VCO waveforms/ranges** | Each of the 4 VCOs: triangle, tri-saw ("shark"), saw, square, wide pulse, narrow pulse. Ranges: LO / 32' / 16' / 8' / 4' / 2'. VCO 2–4 detunable ±7 semitones |
| **VCO 4 special modes** | Inherits Osc-3's tricks: keyboard-control off → free-running; LO range → usable as a third mod source |
| **Mixer** | Per-source on/off rocker + level: VCO 1–4, noise (**white/pink** switch) |
| **Feedback / overload** | The classic output→ext-in feedback trick, modeled as a mixer **Feedback/Drive** control with soft saturation |
| **Ladder filter** | Single shared 24 dB/oct transistor-ladder model, resonance into **self-oscillation**, keyboard tracking switches (1/3 + 2/3, combinable; tracks highest note) |
| **Dual contours** | Filter ADSR (with contour-amount knob) on the shared VCF; amp ADSR cloned per-VCO (authentic MP-4 behavior — releases overlap naturally). **Full ADSR** (locked, Q4) |
| **Controllers** | Glide (with on/off), pitch wheel, mod wheel (mod mix: VCO 4 ↔ noise), A-440 reference tone, master tune |

### 2.2 From the Korg Mono/Poly

Sources: Korg Mono/Poly owner's manual (korg.com PDF), Wikipedia, synthark.org

| Feature | Detail |
|---|---|
| **Key-assign modes** | **Mono** (all 4 VCOs unison, detune spread) · **Poly** (round-robin, one VCO per note, 4-note paraphony) · **Unison/Share** (VCOs redistribute: 1 note→4 osc, 2→2 each, 3-4→shared — now natural with the authentic architecture) · **Chord Memory** (latch a voicing, transpose from one key) |
| **"Effects" section** (the Mono/Poly's secret weapon) | Oscillator **hard sync** and **cross-modulation (X-Mod)**, VCO 1 as master, Single/Double modes, with EG/MG modulation of effect amount for tearing sweeps |
| **Arpeggiator** | Up / Down / Up-Down, **latch**, octave range (1/2/full), internal clock with BPM (tap tempo later), interacts with key-assign modes |
| **PW/PWM** | Shared pulse-width knob + PWM amount with MG source (applies to pulse waves) |
| **Dual mod generators** | MG1 = general LFO (pitch/filter/PW/fx-amount, multiple waveforms) ; MG2 = arp clock / trigger LFO |
| **Trigger mode** | Single/multiple retrigger switch — extra important in a paraphonic instrument (shared filter EG retrigger behavior) |

### 2.3 Modern layer

- **Presets**: factory bank + user patches, JSON import/export, browser persistence.
- **Input**: Web MIDI (note on/off, velocity, pitch bend, mod CC1, sustain CC64) in Chrome/Edge; on-screen keyboard + QWERTY as the Firefox/Safari fallback.
- **Visuals**: oscilloscope + spectrum + VU — restrained, `prefers-reduced-motion` aware.
- **Output safety**: master limiter (self-oscillating resonance + 4-VCO unison protection).
- **Master FX (M5)**: **delay, chorus, and phaser** (locked, Q5) — all rebuilt from scratch, properly this time.

---

## 3. Architecture & stack

Verified via Context7 docs (Tone.js v15) and 2026 web-audio state-of-the-art surveys.

### 3.1 The engine models the real subtractive signal flow — LOCKED (user requirement)

The engine is not an ad-hoc node soup: it is a **typed module graph that mirrors the hardware
block diagram**. Every classic subtractive block is a named engine module with explicit inputs,
outputs, and modulation ports:

```
KBD/MIDI ─→ KeyAssign ─→ [VCO1 VCO2 VCO3 VCO4] ─→ VCA×4 ─→ MIXER (+ NOISE, + FEEDBACK) ─→ VCF ─→ FX ─→ LIMITER ─→ OUT
                              ↑sync/x-mod from VCO1        (drive)                ↑            ↑
Modulators:  EG1 (filter ADSR) ──────────────────────────────────────────────────┘            │
             EG2 (amp ADSR, cloned per VCO) ──────────────────────────────────────────────────┘
             MG1 (LFO) ─→ pitch / PW / VCF / fx-amount        MG2 ─→ arp clock / trigger
             ARP ─→ KeyAssign          WHEELS ─→ pitch / mod-mix (VCO4↔noise)
```

Consequences, in order of importance:
1. **The patch format is the block diagram** — serialized per-module (`vco[0..3]`, `mixer`, `vcf`, `eg1`, …), so a patch is readable as a signal-flow description.
2. **Module graph is introspectable** — the UI can render a live signal-flow view (block diagram with active modulation routes highlighted) directly from the engine's own graph, not a hand-drawn duplicate. Scheduled for M4.
3. **Reusable** — the block library (VCO/VCF/VCA/EG/MG/KeyAssign/Arp as typed TS modules) is the foundation for future synth projects, and its concepts are captured in the `synth-expert` skill.

### 3.2 Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router, TypeScript)**, static export | No server logic needed. Static export deploys to **GitHub Pages** (locked, Q6) via Actions |
| Audio engine | **Framework-free TypeScript core + a single AudioWorklet processor** hosting the paraphonic module graph | Hard sync, X-Mod, and the ladder model need sample-level DSP — impossible with native nodes; Tone.js's synth classes can't express them (verified). One shared signal path = one processor, simple and cheap. React never touches the audio graph |
| DSP specifics | PolyBLEP band-limited oscillators; Huovilainen/ZDF-style ladder filter; exponential ADSR segments | Kills v1's three signature-sound failures (aliasing, wrong filter, clicky envelopes) |
| WASM/Faust | Not now — revisit if CPU-bound | A single paraphonic path in TS-in-worklet is comfortably cheap; Faust/WASM is the documented escape hatch |
| UI state | **Zustand** store; patch object (per-module, §3.1) is the single source of truth; UI → engine via worklet `port`/`AudioParam` | Works outside React (MIDI, arp clock), no context-rerender hazards. `AudioContext` in a ref, created on first user gesture (`'use client'`) |
| Controls | Custom **slider-first** components (§4) — pointer drag, wheel, arrow-key accessible with `aria-valuenow` | User decision: sliders over knobs |
| Testing | **Vitest** (DSP math, key-assign allocation, arp sequencing as pure functions), ESLint + typecheck in CI; Playwright smoke later | Framework-free core = unit-testable without an AudioContext |

---

## 4. UI/UX direction (style guide v2 "Soft Minimalism") — LOCKED

Source of truth: `C:\Claude\vault\knowledge\design\style-guide.md` + `signature-style.css`
(consumed verbatim, like plex-catalog).

- **Soft Minimalism, no skeuomorphism** (locked, Q3): layout honors the hardware (grouped panel
  sections, signal-flow order) but rendering is house style — rounded `--radius:13px` cards on
  dark `--surface`, hairline blue-tinted borders, one `--accent` blue, Varela Round section
  labels, **Fira Code for all parameter values**, no wood, no photoreal anything, no glow.
- **Sliders, not knobs** (locked, Q3): vertical sliders are the primary continuous control —
  better click-drag ergonomics, larger hit area, value reads at a glance, and they echo the
  Mono/Poly's actual slider-heavy panel. Switches for discrete choices (waveform, range,
  key-assign, trigger); numeric Fira Code readout on every slider.
- **Workflow order = layout order:** panels left→right / top→bottom in signal order —
  *Controllers → VCO bank → Mixer → Filter → Envelopes → Mod/Effects-section → Output* —
  performance row (keyboard, wheels, key-assign, arp) anchored at the bottom.
- **Left rail** (Play · Presets · Settings · About) per style guide; the instrument is one view.
- **Behavior policies** (style guide §9): working patch **autosaves**; **Save-as-preset explicit**;
  **confirm** preset overwrite/delete; on-commit toasts; blur validation on preset names; grouped menus.
- **Accessibility:** all controls keyboard-operable (`role="slider"`, arrows = fine, Shift = coarse);
  text ≥4.5:1; state never color-alone; scope/VU honor `prefers-reduced-motion`; hit targets ≥40 px.
- Run flows through the **usability-auditor** skill before calling them done.

---

## 5. GitHub repository setup (MS2K_Interface parity + Projects)

| Feature | MS2K has | web-synth v2 plan |
|---|---|---|
| Issues + templates | ✅ `bug_report.md`, `feature_request.md`, `config.yml` | Same templates, adapted |
| Labels | Default set + `dependencies` | Same |
| Milestones | Versioned + `Backlog` | One per phase (§6) + `Backlog` |
| Workflows | **CI**, **TODO to Issue**, **Dependabot**, **CodeQL** | Same four (CI = lint + typecheck + test + build) **+ Pages deploy workflow** |
| Dependabot | `.github/dependabot.yml` | Same (npm + actions) |
| Discussions | ✅ | Enable |
| Wiki | ✅ | Enable (user manual once features land) |
| Releases | Tagged with notes | `v2.0.0` at completion; pre-releases per milestone |
| License | MIT | Keep |
| **Projects** | enabled | **NEW: Projects v2 board** — status columns (Backlog / Todo / In progress / In review / Done), every issue auto-added, roadmap view by milestone |

Each §2 feature becomes a labeled, milestoned issue on the board.

---

## 6. Build phases (→ milestones)

Repo strategy (locked, Q7): **history preserved** — v2 developed on a `v2` branch via PRs
(exercising CI + the board), merged to `main` at M5; old code tagged `v1.0`.

| Milestone | Contents | Exit criteria |
|---|---|---|
| **M0 — Scaffold & repo reset** | Next.js TS scaffold, `signature-style.css` wired, CI/CodeQL/Dependabot/TODO-to-Issue, templates, labels, milestones, project board, README rewrite; **naming decision** (Q8) | CI green on empty app; board populated |
| **M1 — Paraphonic engine** | Worklet module graph (§3.1): 4× polyBLEP VCOs, shared ladder + self-osc + kb tracking, dual ADSRs (per-VCO amp clones), glide, noise, feedback/drive, **sync + X-Mod**, KeyAssign (Mono/Poly/Share/Chord), trigger modes, limiter | A/B against reference recordings; DSP + allocation unit tests pass |
| **M2 — Control surface** | Full slider-first panel UI, on-screen keyboard + QWERTY, wheels, patch ↔ engine wiring, scope/VU | Every engine param reachable; keyboard-only operation works |
| **M3 — Performance layer** | Arpeggiator (modes/latch/range/BPM), chord memory workflow, Web MIDI in, MG1/MG2 routing UI | Latched arp over MIDI with X-Mod sweep — the Mono/Poly party trick |
| **M4 — Presets, signal-flow view & polish** | Factory bank (classic Model D + Mono/Poly recipes), preset browser, JSON import/export, **live signal-flow visualization** (§3.1), a11y audit, perf pass, usability-auditor run | Lighthouse a11y ≥ 95; full patch under CPU budget on mid hardware |
| **M5 — FX & release** | **Delay + chorus + phaser** rebuilt properly, GitHub Pages deploy, wiki manual, `v2.0.0` release | Tagged release, deployed URL in repo About |

---

## 7. Skills & tooling during the build

- **synth-expert** (new — created from this project's research): subtractive-synthesis reference,
  Model D + Mono/Poly specs, web-audio DSP techniques. Consult during M1/M3.
- **ui-ux-expert** + vault style guide — per-component during M2.
- **usability-auditor** — preset/save/chord-memory flows (M2/M4).
- **web-scraping** — service-manual details during DSP work (M1).
- **dataviz** — scope/spectrum/VU design (M2).
- **code-review / verify / simplify** — per-PR gates. **Context7 docs MCP** — API checks.

---

## 8. Decisions — LOCKED 2026-07-17

| # | Question | Decision |
|---|---|---|
| Q1 | Hybrid vs two emulations | **One hybrid** |
| Q2 | Voice architecture | **Authentic paraphonic** — shared ladder VCF, MP-4 topology (§2, §3.1) |
| Q3 | Panel aesthetic | **Soft Minimalism**, layout homage only; **sliders instead of knobs** |
| Q4 | Envelopes | **Full ADSR** |
| Q5 | Master FX | **Delay, chorus, and phaser** |
| Q6 | Deploy | **GitHub Pages** |
| Q7 | Repo | **Preserve history** (`v2` branch → merge at M5) |
| Q8 | Naming | **Rebrand — name TBD**, decide by M0; repo name stays `web-synth` until then |

Additional locked requirements (2026-07-17):
- **Engine explicitly models the subtractive signal flow** as a typed module graph (§3.1), with a live signal-flow view in the UI (M4).
- **Research captured as a reusable `synth-expert` skill** for ongoing synth work.

---

## 9. Research sources

**Moog Model D:** [Minimoog service notes (archive.org)](https://archive.org/stream/synthmanual-moog-minimoog-service-notes/moogminimoogservicenotes_djvu.txt) · [polynominal.com](https://www.polynominal.com/site/studio/gear/synth/moog_minimoog/index.html) · [workrobot.com Minimoog manual](https://workrobot.com/music/minimoog.html)
**Korg Mono/Poly:** [Owner's manual (korg.com PDF)](https://cdn.korg.com/us/support/download/files/ff9c05f72700ce787eb5a8fd7e37a0d8.pdf) · [Wikipedia](https://en.wikipedia.org/wiki/Korg_Mono/Poly) · [synthark.org](https://synthark.org/Korg/MonoPoly.html) · [Service manual (synthxl.com)](https://www.synthxl.com/wp-content/uploads/2017/12/korg-mono_poly-service-manual.pdf)
**Stack:** [Web Audio 2026 deep-dive (youngju.dev)](https://www.youngju.dev/blog/culture/2026-05-16-web-audio-api-browser-audio-2026-audioworklet-tone-js-howler-wavesurfer-peaks-meyda-faust-csound-web-speech-deep-dive.en) · [Browser audio survey (kuon-rnd.com)](https://kuon-rnd.com/guide/en/browser-audio-technology) · [Tone.js](https://github.com/Tonejs/Tone.js/) (via Context7) · [Next.js synth pitfalls (joeyreyes.dev)](https://www.joeyreyes.dev/blog/next-js-synth/building-a-basic-next-js-synthesizer)
