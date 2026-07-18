# Decisions

Product decisions, locked with the owner. Operational/CI decisions live in [REPO.md](REPO.md).

## Why a rewrite (2026-07-17)

v1 (vanilla JS + Express) had: a monolithic 54 KB `synth.js` mixing audio and DOM; aliasing
native oscillators; a 12 dB biquad standing in for a ladder filter; linear (clicky) envelope
ramps; three broken effects; near-zero test coverage. Ideas were salvaged, no code.

## Locked 2026-07-17

| # | Question | Decision |
|---|---|---|
| Q1 | Hybrid vs two emulations | **One hybrid** — Model D voice × Mono/Poly performance brain |
| Q2 | Voice architecture | **Authentic paraphonic** — shared ladder VCF, MP-4 topology |
| Q3 | Panel aesthetic | **Soft Minimalism**, layout homage only; **sliders instead of knobs** |
| Q4 | Envelopes | **Full ADSR** (authentic ADS+decay-switch behavior possible later as a toggle) |
| Q5 | Master FX | **Delay, chorus, and phaser** |
| Q6 | Deploy | **GitHub Pages** (static export) |
| Q7 | Repo | **Preserve history** — `v2` branch via PRs, merge to `main` at M5 |
| Q8 | Naming | **Rebrand — name TBD** (decide by M5 release; repo stays `web-synth` until then) |

Additional locked requirements (2026-07-17):

- **The engine explicitly models the subtractive signal flow** as a typed module graph
  ([ARCHITECTURE.md](ARCHITECTURE.md)), with a live signal-flow UI view in M4.
- **Research captured as the reusable `synth-expert` skill** for ongoing synth work.

## Steered during M2 review (2026-07-18)

- **PW/PWM belong in the oscillator panel** as shared sliders (Mono/Poly placement), not a
  routing slider buried in MG1.
- **Moog-style sync Interval** control added to the Effects section (0..+24 st slave offset).
